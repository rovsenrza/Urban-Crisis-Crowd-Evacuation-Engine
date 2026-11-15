"""Operator endpoints (Module 2).

Everything but sign-in needs a session. Reading the console is open to every
role; the critical operations (confirming an alert, which dispatches a rescue
brigade; dismissing one; changing a brigade's status) need the dispatcher role.
"""
from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.encoders import jsonable_encoder

from ...domain.errors import TooManyRequests
from ...domain.models import AlertStatus, SOSStatus
from ...services import auth
from .. import schemas as s
from ..deps import (
    AlertDeciderDep,
    BrigadeManagerDep,
    ClaimsDep,
    ContainerDep,
    client_ip,
    require_operator,
)

router = APIRouter()
protected = APIRouter(dependencies=[Depends(require_operator)])

LOGIN_WINDOW_S = 60.0


@router.post("/auth/login", response_model=s.LoginOut, tags=["auth"],
             summary="Dispetçer girişi: rolu daşıyan JWT qaytarır")
async def login(body: s.LoginIn, request: Request, c: ContainerDep) -> Any:
    cfg = c.settings
    # Counted before the password is checked, so guessing is limited too.
    retry_after = c.limiter.hit(f"login:{client_ip(request)}", cfg.login_rate_per_ip, LOGIN_WINDOW_S)
    if retry_after is not None:
        raise TooManyRequests("Çox sayda giriş cəhdi. Bir az sonra yenidən cəhd edin",
                              details={"retry_after_s": int(retry_after)})
    subject, role = auth.authenticate(cfg, body.username, body.password)
    ttl_s = int(cfg.jwt_ttl_min * 60)
    token = auth.issue_token(subject, role, c.clock.now(), timedelta(seconds=ttl_s), cfg.jwt_secret)
    return {"token": token, "operator": subject, "role": role, "expires_in": ttl_s}


@router.get("/auth/me", response_model=s.MeOut, tags=["auth"],
            summary="Cari sessiya: operator, rol və icazələr")
async def me(claims: ClaimsDep) -> Any:
    return {"operator": claims.sub, "role": claims.role,
            "permissions": auth.permissions_of(claims.role)}


@protected.get("/dashboard/snapshot", tags=["operator"],
               summary="Panelin ilkin vəziyyəti (sonrası WebSocket ilə)")
async def snapshot(c: ContainerDep, roads: bool = True) -> Response:
    """`?roads=false` leaves the street network out (fetch it from `/roads` in parallel)."""
    body = json.dumps(jsonable_encoder(c.dashboard.snapshot()), ensure_ascii=False,
                      separators=(",", ":")).encode()
    if roads:
        # Splice the ready-made network in instead of re-serializing thousands of segments.
        body = b'{"roads":' + c.roads_cache.json() + b"," + body[1:]
    return Response(body, media_type="application/json")


@protected.get("/sos", response_model=list[s.SOSOut], tags=["sos"])
async def list_sos(c: ContainerDep, status: SOSStatus | None = None) -> Any:
    return c.sos.list(status)


@protected.get("/brigades", response_model=list[s.BrigadeOut], tags=["operator"])
async def list_brigades(c: ContainerDep) -> Any:
    return c.brigades.list()


@protected.patch("/brigades/{brigade_id}/status", response_model=s.BrigadeOut, tags=["operator"])
async def set_brigade_status(brigade_id: int, body: s.BrigadeStatusIn, c: ContainerDep,
                             _: BrigadeManagerDep) -> Any:
    return await c.brigades.set_status(brigade_id, body.status)


@protected.get("/alerts", response_model=list[s.AlertOut], tags=["alerts"])
async def list_alerts(c: ContainerDep, status: AlertStatus | None = None) -> Any:
    return c.decisions.list(status)


@protected.post(
    "/alerts/{alert_id}/confirm", response_model=s.ConfirmOut, tags=["alerts"],
    summary="Bir kliklə təsdiq: briqada göndər + ehtiyat nöqtə aç + yenidən yönləndir",
)
async def confirm_alert(alert_id: int, c: ContainerDep, operator: AlertDeciderDep) -> Any:
    return await c.decisions.confirm(alert_id, operator)


@protected.post("/alerts/{alert_id}/dismiss", response_model=s.AlertOut, tags=["alerts"],
                summary="Həyəcanı səbəb göstərməklə rədd et")
async def dismiss_alert(alert_id: int, body: s.DismissIn, c: ContainerDep,
                        operator: AlertDeciderDep) -> Any:
    return await c.decisions.dismiss(alert_id, operator, body.reason)


@protected.get("/audit-log", response_model=list[s.AuditOut], tags=["operator"])
async def audit_log(c: ContainerDep, limit: int = 100) -> Any:
    with c.uow() as uow:
        return uow.audit.list(limit)


router.include_router(protected)
