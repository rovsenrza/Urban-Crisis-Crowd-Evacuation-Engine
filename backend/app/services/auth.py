"""Dispatcher sessions: HS256 JWT and role-based permissions.

The token is a standard JWT (header.payload.signature, base64url, HMAC-SHA256)
built with the standard library, so the backend gains no dependency. Only
HS256 is accepted: a token that names any other algorithm ("none" included)
is rejected before its signature is looked at.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from ..config import Settings
from ..domain.errors import Forbidden, Unauthorized

ALGORITHM = "HS256"

# -- roles and permissions ---------------------------------------------------

OBSERVER, DISPATCHER, ADMIN = "observer", "dispatcher", "admin"
ROLES = (OBSERVER, DISPATCHER, ADMIN)

READ = "console:read"              # snapshot, SOS, brigades, alerts, audit log, live socket
DECIDE_ALERTS = "alerts:decide"    # confirm (dispatches a rescue brigade) or dismiss an alert
MANAGE_BRIGADES = "brigades:manage"  # change a brigade's status
SIMULATE = "simulation:run"        # every /sim/* endpoint: road closures, scenario, reset

# The one table that says who may do what.
PERMISSIONS: dict[str, frozenset[str]] = {
    READ: frozenset({OBSERVER, DISPATCHER, ADMIN}),
    DECIDE_ALERTS: frozenset({DISPATCHER, ADMIN}),
    MANAGE_BRIGADES: frozenset({DISPATCHER, ADMIN}),
    SIMULATE: frozenset({ADMIN}),
}


def permissions_of(role: str) -> list[str]:
    return [permission for permission, roles in PERMISSIONS.items() if role in roles]


def ensure_permission(role: str, permission: str) -> None:
    if role not in PERMISSIONS[permission]:
        raise Forbidden("Bu əməliyyat üçün icazəniz yoxdur", details={"required": permission, "role": role})


# -- JWT -----------------------------------------------------------------------


@dataclass(frozen=True)
class Claims:
    sub: str
    role: str
    exp: int  # seconds since the epoch


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(message: str, secret: str) -> str:
    return _b64encode(hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest())


def issue_token(subject: str, role: str, now: datetime, ttl: timedelta, secret: str) -> str:
    header = {"alg": ALGORITHM, "typ": "JWT"}
    payload = {"sub": subject, "role": role, "iat": int(now.timestamp()),
               "exp": int((now + ttl).timestamp())}
    message = ".".join(_b64encode(json.dumps(part, separators=(",", ":")).encode())
                       for part in (header, payload))
    return f"{message}.{_sign(message, secret)}"


def verify_token(token: str, now: datetime, secret: str) -> Claims:
    """Claims of a valid token; `Unauthorized` for anything else."""
    invalid = Unauthorized("Sessiya etibarsızdır. Yenidən daxil olun")
    try:
        header_part, payload_part, signature = token.split(".")
        header = json.loads(_b64decode(header_part))
        if not isinstance(header, dict) or header.get("alg") != ALGORITHM:
            raise invalid
        expected = _sign(f"{header_part}.{payload_part}", secret)
        if not hmac.compare_digest(signature.encode(), expected.encode()):
            raise invalid
        payload = json.loads(_b64decode(payload_part))
        claims = Claims(sub=str(payload["sub"]), role=str(payload["role"]), exp=int(payload["exp"]))
    except (ValueError, KeyError, TypeError, binascii.Error, UnicodeDecodeError) as exc:
        raise invalid from exc
    if claims.role not in ROLES:
        raise invalid
    if now.timestamp() >= claims.exp:
        raise Unauthorized("Sessiyanın vaxtı bitib. Yenidən daxil olun", "token_expired")
    return claims


# -- accounts ------------------------------------------------------------------


def _same(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode(), b.encode())


def authenticate(settings: Settings, username: str, password: str) -> tuple[str, str]:
    """(subject, role) for a correct username and password."""
    accounts = [(settings.operator_username, settings.operator_password, settings.operator_role)]
    if settings.observer_password:  # an empty password disables the account
        accounts.append((settings.observer_username, settings.observer_password, OBSERVER))
    match: tuple[str, str] | None = None
    for name, secret, role in accounts:  # no early exit: same work for every account
        if _same(username, name) & _same(password, secret) and role in ROLES:
            match = (name, role)
    if match is None:
        raise Unauthorized("İstifadəçi adı və ya parol yanlışdır", "invalid_credentials")
    return match


def identify(settings: Settings, token: str | None, now: datetime) -> Claims:
    """Who a bearer token belongs to: a JWT session, or the static service token."""
    if not token:
        raise Unauthorized("Operator girişi tələb olunur")
    service = settings.operator_token
    # The service token (scripts, demo) acts as an admin. Empty disables it.
    if service and _same(token, service):
        return Claims(sub=settings.operator_username, role=ADMIN, exp=0)
    return verify_token(token, now, settings.jwt_secret)
