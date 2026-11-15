"""Domain events published on the event bus.

`name` is the stable wire name (also used as the WebSocket message type).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, ClassVar

from .evacuation import EvacuationPlan
from .models import Alert, AssemblyPoint, Brigade, RoadEdge, SOSSignal


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True, kw_only=True)
class DomainEvent:
    name: ClassVar[str] = "event"
    occurred_at: datetime = field(default_factory=_utcnow)


@dataclass(frozen=True, kw_only=True)
class SOSCreated(DomainEvent):
    name: ClassVar[str] = "sos.created"
    sos: SOSSignal


@dataclass(frozen=True, kw_only=True)
class CitizenMarkedSafe(DomainEvent):
    name: ClassVar[str] = "citizen.safe"
    citizen_id: str
    resolved_sos_ids: list[int]


@dataclass(frozen=True, kw_only=True)
class RoadStatusChanged(DomainEvent):
    name: ClassVar[str] = "road.changed"
    edge: RoadEdge


@dataclass(frozen=True, kw_only=True)
class AssemblyOccupancyChanged(DomainEvent):
    name: ClassVar[str] = "assembly.occupancy"
    point: AssemblyPoint
    previous_pct: float


@dataclass(frozen=True, kw_only=True)
class AssemblyPointActivated(DomainEvent):
    name: ClassVar[str] = "assembly.activated"
    point: AssemblyPoint


@dataclass(frozen=True, kw_only=True)
class AlertRaised(DomainEvent):
    name: ClassVar[str] = "alert.raised"
    alert: Alert


@dataclass(frozen=True, kw_only=True)
class AlertConfirmed(DomainEvent):
    name: ClassVar[str] = "alert.confirmed"
    alert: Alert
    brigade: Brigade | None
    activated_point: AssemblyPoint | None


@dataclass(frozen=True, kw_only=True)
class AlertDismissed(DomainEvent):
    name: ClassVar[str] = "alert.dismissed"
    alert: Alert


@dataclass(frozen=True, kw_only=True)
class BrigadeStatusChanged(DomainEvent):
    name: ClassVar[str] = "brigade.changed"
    brigade: Brigade


@dataclass(frozen=True, kw_only=True)
class CitizenRerouted(DomainEvent):
    """A tracked citizen's plan was recomputed. `changed` is False when the
    route stays the same and the push is informational only."""

    name: ClassVar[str] = "citizen.rerouted"
    citizen_id: str
    reason: str  # road_closed | point_full | alert_confirmed
    changed: bool
    detail: dict[str, Any]
    plan: EvacuationPlan
    previous_point_id: int | None


@dataclass(frozen=True, kw_only=True)
class ScenarioProgress(DomainEvent):
    name: ClassVar[str] = "sim.progress"
    scenario: str
    step: int
    total: int
    message: str  # default-language (Azerbaijani) text
    running: bool
    code: str = ""  # i18n key suffix so clients can localise the message
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, kw_only=True)
class SystemReset(DomainEvent):
    name: ClassVar[str] = "system.reset"
