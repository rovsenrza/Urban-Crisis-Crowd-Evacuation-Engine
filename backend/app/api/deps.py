"""FastAPI dependencies: container access, JWT sessions and role checks."""
from __future__ import annotations

from typing import Annotated, Awaitable, Callable

from fastapi import Depends, Header, Request

from ..container import Container
from ..domain.errors import DomainError, Unauthorized
from ..services import auth


async def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]


def _bearer(authorization: str | None) -> str | None:
    scheme, _, token = (authorization or "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def token_is_valid(container: Container, token: str | None) -> bool:
    """True for a valid JWT session of any role or the service token (used by the WebSocket)."""
    try:
        auth.identify(container.settings, token, container.clock.now())
    except Unauthorized:
        return False
    return True


async def current_claims(container: ContainerDep,
                   authorization: Annotated[str | None, Header()] = None) -> auth.Claims:
    """`Authorization: Bearer <JWT>`; 401 when missing, invalid or expired."""
    return auth.identify(container.settings, _bearer(authorization), container.clock.now())


ClaimsDep = Annotated[auth.Claims, Depends(current_claims)]


def require_permission(permission: str) -> Callable[[auth.Claims], Awaitable[str]]:
    """Dependency: the caller's role must hold `permission`. Returns the operator name (audit actor)."""

    async def dependency(claims: ClaimsDep) -> str:
        auth.ensure_permission(claims.role, permission)
        return claims.sub

    return dependency


# Read access to the console: every signed-in role.
require_operator = require_permission(auth.READ)
OperatorDep = Annotated[str, Depends(require_operator)]
# Critical operations.
AlertDeciderDep = Annotated[str, Depends(require_permission(auth.DECIDE_ALERTS))]
BrigadeManagerDep = Annotated[str, Depends(require_permission(auth.MANAGE_BRIGADES))]
require_simulator = require_permission(auth.SIMULATE)


async def require_simulation(container: ContainerDep) -> None:
    if not container.settings.sim_enabled:
        raise DomainError("Simulyasiya söndürülüb (SIM_ENABLED=false)", "simulation_disabled")


def client_ip(request: Request) -> str:
    """Address used for per-client limits.

    `X-Forwarded-For` is only believed when the deployment says a trusted
    proxy sets it (TRUST_FORWARDED_FOR); otherwise anyone could spoof it to
    dodge the limit.
    """
    container: Container = request.app.state.container
    if container.settings.trust_forwarded_for:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
