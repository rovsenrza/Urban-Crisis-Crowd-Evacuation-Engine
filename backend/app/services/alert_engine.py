"""Rule engine runtime: feeds bus events to rules, dedups, persists, publishes."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Sequence

from ..adapters.db.repositories import UnitOfWork, UowFactory
from ..config import Settings
from ..domain.alerts import RuleRegistry
from ..domain.events import AlertRaised, DomainEvent
from ..domain.models import Alert, SOSSignal, Thresholds
from ..domain.ports import Clock, EventBus


class DbRuleContext:
    """`RuleContext` backed by the current unit of work."""

    def __init__(self, uow: UnitOfWork, now: datetime, thresholds: Thresholds) -> None:
        self._uow = uow
        self.now = now
        self.thresholds = thresholds
        self.cooldown_start = now - timedelta(minutes=thresholds.alert_cooldown_min)

    def open_sos_since(self, since: datetime) -> Sequence[SOSSignal]:
        return self._uow.sos.open_since(since)

    def active_alerts(self, rule_id: str) -> Sequence[Alert]:
        return self._uow.alerts.active(rule_id, self.cooldown_start)


class AlertEngine:
    def __init__(self, uow: UowFactory, bus: EventBus, clock: Clock, settings: Settings,
                 registry: RuleRegistry) -> None:
        self._uow, self._bus, self._clock = uow, bus, clock
        self._thresholds = settings.thresholds()
        self._registry = registry

    def attach(self, bus: EventBus) -> None:
        bus.subscribe(None, self.handle)

    async def handle(self, event: DomainEvent) -> list[Alert]:
        rules = [r for r in self._registry.rules() if isinstance(event, r.event_types)]
        if not rules:
            return []
        raised: list[Alert] = []
        with self._uow() as uow:
            context = DbRuleContext(uow, self._clock.now(), self._thresholds)
            for rule in rules:
                for candidate in rule.evaluate(event, context):
                    # Dedup: same key is blocked while an alert is open or was
                    # closed less than ALERT_COOLDOWN_MIN ago.
                    if uow.alerts.find_blocking(candidate.dedup_key, context.cooldown_start):
                        continue
                    raised.append(uow.alerts.add(candidate, context.now))
            uow.commit()
        for alert in raised:
            await self._bus.publish(AlertRaised(alert=alert, occurred_at=alert.created_at))
        return raised
