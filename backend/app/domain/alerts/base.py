"""Alert rule contract."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar, Protocol, Sequence

from ..events import DomainEvent
from ..models import Alert, AlertSeverity, SOSSignal, Thresholds

# Recommended operator action attached to every RED alert.
RED_ALERT_ACTION = "Əlavə xilasetmə briqadası göndər və yeni toplanış nöqtəsi aç"


@dataclass
class AlertCandidate:
    """What a rule wants to raise; the engine handles dedup and persistence."""

    rule_id: str
    dedup_key: str
    lat: float
    lng: float
    zone_id: str | None
    payload: dict[str, Any] = field(default_factory=dict)
    severity: AlertSeverity = AlertSeverity.RED
    message: str = RED_ALERT_ACTION


class RuleContext(Protocol):
    """Read-only view of system state offered to rules."""

    now: datetime
    thresholds: Thresholds

    def open_sos_since(self, since: datetime) -> Sequence[SOSSignal]:
        """Open SOS signals created at or after `since`."""

    def active_alerts(self, rule_id: str) -> Sequence[Alert]:
        """Alerts of a rule that are open or still inside the cooldown."""


class AlertRule(ABC):
    """One crisis-detection rule.

    To add a rule: create a module in `domain/alerts/rules/`, subclass
    `AlertRule`, decorate it with `@register_rule`. Nothing else changes.
    """

    rule_id: ClassVar[str]
    # Events this rule reacts to; lets the engine skip irrelevant events cheaply.
    event_types: ClassVar[tuple[type[DomainEvent], ...]] = ()

    @abstractmethod
    def evaluate(self, event: DomainEvent, context: RuleContext) -> list[AlertCandidate]: ...
