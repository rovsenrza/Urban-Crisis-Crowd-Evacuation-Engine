"""Anonymous citizen-facing endpoints (Module 1)."""
from __future__ import annotations

from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Request, Response

from ...domain.ports import routing_status
from ...domain.roles import ROLE_POLICIES, CitizenRole, normalize_role
from .. import schemas as s
from ..deps import ContainerDep, client_ip

router = APIRouter()

CitizenPath = Annotated[str, Path(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


@router.get("/health", tags=["meta"])
async def health(c: ContainerDep) -> dict[str, Any]:
    return {"status": "ok", "routing_provider": c.routing.name,
            "routing": asdict(routing_status(c.routing)), "connections": c.connections.stats(),
            "abuse": {"sos_rejected": c.sos_guard.rejected}}


@router.get("/meta", tags=["meta"], summary="Zonalar, təhlükə növləri və hədlər")
async def meta(c: ContainerDep) -> dict[str, Any]:
    cfg = c.settings
    with c.uow() as uow:
        zones = uow.zones.list()
    return {
        "zones": zones,
        "hazards": c.hazards.all(),
        "roles": [
            {"code": role.value, "sos_priority": int(policy.sos_priority),
             "accessible_route": policy.accessible_route}
            for role, policy in ROLE_POLICIES.items()
        ],
        "thresholds": {
            "occupancy_yellow_pct": cfg.occupancy_yellow_pct,
            "occupancy_red_pct": cfg.occupancy_red_pct,
            "reroute_occupancy_pct": cfg.reroute_occupancy_pct,
            "critical_occupancy_pct": cfg.critical_occupancy_pct,
            "sos_cluster_radius_m": cfg.sos_cluster_radius_m,
            "sos_cluster_window_min": cfg.sos_cluster_window_min,
            "sos_cluster_min_count": cfg.sos_cluster_min_count,
            "sos_dedup_window_s": cfg.sos_dedup_window_s,
        },
        "map": {"center": [cfg.city_center_lat, cfg.city_center_lng], "zoom": 12},
        "routing_provider": c.routing.name,
        "sim_enabled": cfg.sim_enabled,
    }


@router.get("/zones", response_model=list[s.ZoneOut], tags=["meta"])
async def zones(c: ContainerDep) -> Any:
    with c.uow() as uow:
        return uow.zones.list()


@router.get("/hazards", response_model=list[s.HazardOut], tags=["meta"])
async def hazard_types(c: ContainerDep) -> Any:
    return c.hazards.all()


@router.get("/assembly-points", response_model=list[s.AssemblyPointOut], tags=["assembly"])
async def assembly_points(c: ContainerDep, active_only: bool = False) -> Any:
    return c.assembly.list(active_only)


@router.get(
    "/assembly-points/nearest", response_model=s.EvacuationPlanOut, tags=["assembly"],
    summary="Ən yaxın aktiv toplanış nöqtələri (marşrut məsafəsinə görə)",
)
async def nearest_points(
    c: ContainerDep,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    zone_id: str | None = None,
    limit: Annotated[int | None, Query(ge=1, le=20)] = None,
    role: CitizenRole | None = None,
) -> Any:
    return c.evacuation.plan(lat, lng, zone_id, limit, role)


@router.post(
    "/citizens/{citizen_id}/route", response_model=s.EvacuationPlanOut, tags=["citizen"],
    summary="Evakuasiya planını hesabla və vətəndaşın cari marşrutu kimi izlə",
)
async def track_route(citizen_id: CitizenPath, body: s.RouteIn, c: ContainerDep) -> Any:
    return c.evacuation.track(citizen_id, body.lat, body.lng, body.zone_id, body.target_point_id,
                              role=body.role)


@router.get("/citizens/{citizen_id}/state", response_model=s.CitizenStateOut, tags=["citizen"])
async def citizen_state(citizen_id: CitizenPath, c: ContainerDep) -> Any:
    state = c.evacuation.citizen_state(citizen_id)
    with c.uow() as uow:
        open_sos = uow.sos.latest_open_for_citizen(citizen_id)
    return {
        "citizen_id": citizen_id,
        "role": normalize_role(state.role if state else None),
        "is_safe": state.is_safe if state else False,
        "lat": state.lat if state else None,
        "lng": state.lng if state else None,
        "target_point_id": state.target_point_id if state else None,
        "open_sos": open_sos,
    }


@router.post(
    "/citizens/{citizen_id}/safe", response_model=s.SafeOut, tags=["citizen"],
    summary="«Təhlükəsizəm»: açıq SOS-ları bağlayır",
)
async def mark_safe(citizen_id: CitizenPath, c: ContainerDep) -> Any:
    resolved = await c.sos.mark_safe(citizen_id)
    return {"citizen_id": citizen_id, "is_safe": True,
            "resolved_sos_ids": [sos.id for sos in resolved]}


@router.post(
    "/sos", response_model=s.SOSCreateOut, status_code=201, tags=["sos"],
    summary="Bir kliklə SOS (60 s ərzində təkrar basış dublikat yaratmır; "
            "hərəkət məhdudiyyətli rol üçün Prioritet №1)",
    responses={
        200: {"model": s.SOSCreateOut, "description": "Dublikat: mövcud SOS qaytarılır"},
        429: {"description": "Sürət həddi (`rate_limited`) və ya eyni yerdən təkrar siqnal "
                             "(`duplicate_signal`); `Retry-After` başlığı ilə"},
    },
)
async def create_sos(body: s.SOSIn, request: Request, response: Response, c: ContainerDep) -> Any:
    # Cheap in-memory checks first: a flood is turned away before it reaches the database.
    c.sos_guard.check(body.citizen_id, client_ip(request), body.lat, body.lng, body.hazard_type)
    sos, duplicate = await c.sos.create(body.citizen_id, body.lat, body.lng, body.hazard_type,
                                        body.role)
    if duplicate:
        response.status_code = 200
    return {"sos": sos, "duplicate": duplicate}


@router.get("/roads", response_model=s.RoadsOut, tags=["roads"],
            summary="Yol qrafı və bağlı yollar")
async def roads(request: Request, c: ContainerDep) -> Response:
    # Served from memory, already serialized (and compressed when the client accepts gzip).
    if "gzip" in request.headers.get("accept-encoding", ""):
        return Response(c.roads_cache.gzipped(), media_type="application/json",
                        headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    return Response(c.roads_cache.json(), media_type="application/json")