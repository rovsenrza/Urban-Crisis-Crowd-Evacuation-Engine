"""Domain entities: plain dataclasses, no framework or ORM imports."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from .geo import GeoPoint, LatLng


class AssemblyKind(str, Enum):
    SHELTER = "shelter"
    PARK = "park"
    STADIUM = "stadium"


class BrigadeStatus(str, Enum):
    AVAILABLE = "available"
    EN_ROUTE = "en_route"
    ON_SITE = "on_site"
    RETURNING = "returning"


class SOSStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class AlertStatus(str, Enum):
    OPEN = "open"
    CONFIRMED = "confirmed"
    DISMISSED = "dismissed"


class AlertSeverity(str, Enum):
    RED = "red"
    ORANGE = "orange"


@dataclass
class Zone:
    id: str
    name: str
    lat: float
    lng: float

    @property
    def position(self) -> GeoPoint:
        return GeoPoint(self.lat, self.lng)


@dataclass
class AssemblyPoint:
    id: int
    name: str
    kind: AssemblyKind
    lat: float
    lng: float
    capacity: int
    occupancy: int
    is_active: bool
    is_reserve: bool
    zone_id: str
    # Barrier-free entrance (ramp, no steps): usable by wheelchair / medical transport.
    is_accessible: bool = True
    occupancy_pct: float = field(init=False)

    def __post_init__(self) -> None:
        # Multiply before dividing so 950/1000 is exactly 95.0 (threshold maths).
        self.occupancy_pct = self.occupancy * 100 / self.capacity if self.capacity else 0.0

    @property
    def position(self) -> GeoPoint:
        return GeoPoint(self.lat, self.lng)


@dataclass
class Brigade:
    id: int
    name: str
    status: BrigadeStatus
    lat: float
    lng: float
    target_lat: float | None = None
    target_lng: float | None = None
    target_alert_id: int | None = None
    eta_s: int | None = None
    route: list[LatLng] = field(default_factory=list)

    @property
    def position(self) -> GeoPoint:
        return GeoPoint(self.lat, self.lng)


@dataclass
class RoadNode:
    id: str
    lat: float
    lng: float

    @property
    def position(self) -> GeoPoint:
        return GeoPoint(self.lat, self.lng)


@dataclass
class RoadEdge:
    id: str
    name: str
    source: str
    target: str
    length_m: float
    is_open: bool = True
    # Barrier-free (ramps, no stairs or steep sections).
    is_accessible: bool = True
    kind: str = "road"  # OSM highway class: primary, secondary, residential …
    # Polyline of the street segment from source to target (lat, lng).
    geometry: list[LatLng] = field(default_factory=list)


@dataclass
class RoadGraph:
    nodes: list[RoadNode]
    edges: list[RoadEdge]


@dataclass
class Route:
    distance_m: float
    geometry: list[LatLng]
    edge_ids: list[str] = field(default_factory=list)


@dataclass
class SOSSignal:
    id: int
    citizen_id: str
    lat: float
    lng: float
    zone_id: str
    hazard_type: str
    status: SOSStatus
    created_at: datetime
    resolved_at: datetime | None = None
    priority: int = 3  # SOSPriority: 1 = critical ("Priority #1"), 3 = normal
    citizen_role: str = "standard"

    @property
    def position(self) -> GeoPoint:
        return GeoPoint(self.lat, self.lng)


@dataclass
class Alert:
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
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    dismiss_reason: str | None = None
    actions: dict[str, Any] = field(default_factory=dict)

    @property
    def position(self) -> GeoPoint:
        return GeoPoint(self.lat, self.lng)


@dataclass
class AuditEntry:
    id: int
    actor: str
    action: str
    alert_id: int | None
    details: dict[str, Any]
    created_at: datetime


@dataclass
class CitizenState:
    """Last known position and tracked evacuation route of an anonymous citizen."""

    citizen_id: str
    role: str = "standard"  # CitizenRole value
    lat: float | None = None
    lng: float | None = None
    is_safe: bool = False
    safe_at: datetime | None = None
    target_point_id: int | None = None
    # True when the citizen picked the target themselves (not the recommendation).
    manual_target: bool = False
    edge_ids: list[str] = field(default_factory=list)
    distance_m: float | None = None
    updated_at: datetime | None = None

    @property
    def position(self) -> GeoPoint | None:
        if self.lat is None or self.lng is None:
            return None
        return GeoPoint(self.lat, self.lng)


@dataclass(frozen=True)
class Thresholds:
    """All tunable limits used by domain logic; filled from configuration."""

    sos_cluster_radius_m: float = 500.0
    sos_cluster_window_min: float = 5.0
    sos_cluster_min_count: int = 4
    reroute_occupancy_pct: float = 90.0
    critical_occupancy_pct: float = 95.0
    alert_cooldown_min: float = 10.0
    occupancy_yellow_pct: float = 70.0
    occupancy_red_pct: float = 90.0
