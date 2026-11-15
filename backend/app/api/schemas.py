"""Pydantic v2 request/response schemas (the public API contract)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from ..domain.models import (
    AlertSeverity,
    AlertStatus,
    AssemblyKind,
    BrigadeStatus,
    SOSStatus,
)
from ..domain.roles import CitizenRole

Lat = Field(ge=-90, le=90)
Lng = Field(ge=-180, le=180)
CitizenId = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    """Every non-2xx response has this shape."""

    error: ErrorDetail


class GeoPointOut(BaseModel):
    lat: float
    lng: float


class ZoneOut(BaseModel):
    id: str
    name: str
    lat: float
    lng: float


class HazardOut(BaseModel):
    code: str
    label: str
    color: str
    icon: str


class AssemblyPointOut(BaseModel):
    id: int
    name: str
    kind: AssemblyKind
    lat: float
    lng: float
    capacity: int
    occupancy: int
    occupancy_pct: float
    is_active: bool
    is_reserve: bool
    is_accessible: bool
    zone_id: str


class EvacuationOptionOut(BaseModel):
    point: AssemblyPointOut
    distance_m: float
    eta_s: int
    geometry: list[tuple[float, float]]
    edge_ids: list[str]
    level: str


class EvacuationPlanOut(BaseModel):
    origin: GeoPointOut
    options: list[EvacuationOptionOut]
    recommended_point_id: int | None
    selected_point_id: int | None
    reachable: bool
    all_full: bool
    accessible: bool
    routing_mode: str = "live"
    fallback_source: str | None = None


class RoleOut(BaseModel):
    code: CitizenRole
    sos_priority: int
    accessible_route: bool


class RouteIn(BaseModel):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    zone_id: str | None = None
    target_point_id: int | None = None
    # Omit to keep the citizen's stored role.
    role: CitizenRole | None = None

    model_config = {"json_schema_extra": {"example": {"lat": 40.3853, "lng": 49.8127}}}


class SOSIn(BaseModel):
    citizen_id: str = CitizenId
    lat: float = Lat
    lng: float = Lng
    hazard_type: str
    # "mobility_impaired" makes the SOS Priority #1. Omit to use the stored role.
    role: CitizenRole | None = None

    model_config = {
        "json_schema_extra": {
            "example": {"citizen_id": "3f2b8c1e-7a55-4c1f-9d2e-5b8f0a6c1d11", "lat": 40.3853,
                        "lng": 49.8127, "hazard_type": "collapse"}
        }
    }


class SOSOut(BaseModel):
    id: int
    citizen_id: str
    lat: float
    lng: float
    zone_id: str
    hazard_type: str
    status: SOSStatus
    created_at: datetime
    resolved_at: datetime | None
    priority: int
    citizen_role: str


class SOSCreateOut(BaseModel):
    sos: SOSOut
    duplicate: bool


class SafeOut(BaseModel):
    citizen_id: str
    is_safe: bool
    resolved_sos_ids: list[int]


class CitizenStateOut(BaseModel):
    citizen_id: str
    role: CitizenRole
    is_safe: bool
    lat: float | None
    lng: float | None
    target_point_id: int | None
    open_sos: SOSOut | None


class RoadNodeOut(BaseModel):
    id: str
    lat: float
    lng: float


class RoadEdgeOut(BaseModel):
    id: str
    name: str
    source: str
    target: str
    length_m: float
    is_open: bool
    is_accessible: bool
    kind: str
    geometry: list[tuple[float, float]]


class RoadsOut(BaseModel):
    nodes: list[RoadNodeOut]
    edges: list[RoadEdgeOut]


class BrigadeOut(BaseModel):
    id: int
    name: str
    status: BrigadeStatus
    lat: float
    lng: float
    target_lat: float | None
    target_lng: float | None
    target_alert_id: int | None
    eta_s: int | None
    route: list[tuple[float, float]]


class BrigadeStatusIn(BaseModel):
    status: BrigadeStatus


class AlertOut(BaseModel):
    id: int
    rule_id: str
    severity: AlertSeverity
    status: AlertStatus
    dedup_key: str
    message: str
    lat: float
    lng: float
    zone_id: str | None
    payload: dict[str, Any]
    created_at: datetime
    resolved_at: datetime | None
    resolved_by: str | None
    dismiss_reason: str | None
    actions: dict[str, Any]


class ConfirmOut(BaseModel):
    alert: AlertOut
    brigade: BrigadeOut | None
    activated_point: AssemblyPointOut | None
    already_processed: bool


class DismissIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class AuditOut(BaseModel):
    id: int
    actor: str
    action: str
    alert_id: int | None
    details: dict[str, Any]
    created_at: datetime


class LoginIn(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    token: str
    token_type: str = "bearer"
    operator: str
    role: str
    expires_in: int  # seconds


class MeOut(BaseModel):
    operator: str
    role: str
    permissions: list[str]


class SimSOSIn(BaseModel):
    zone_id: str
    count: int = Field(default=1, ge=1, le=50)
    hazard_type: str | None = None
    role: CitizenRole | None = None


class SimOccupancyIn(BaseModel):
    delta_pct: float | None = Field(default=None, ge=-100, le=100)
    occupancy_pct: float | None = Field(default=None, ge=0, le=100)


class SimRoadsIn(BaseModel):
    action: str = Field(pattern="^(close|open)$")
    count: int = Field(default=1, ge=1, le=50)


class ScenarioStartIn(BaseModel):
    speed: float = Field(default=1.0, ge=0, le=100)
    reset: bool = True


class ScenarioStatusOut(BaseModel):
    running: bool
    scenario: str | None
    step: int
    total: int
    message: str
    code: str = ""
    params: dict[str, Any] = {}
