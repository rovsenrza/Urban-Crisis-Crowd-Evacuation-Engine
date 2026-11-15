"""Notification channels (implementations of the `Notifier` port).

To add SMS / push / e-mail: write a class with `channel` and `send_alert`,
then append an instance to the list in `container.py`.
"""
from __future__ import annotations

import logging

from ...domain.events import AlertRaised, DomainEvent
from ...domain.models import Alert
from ...domain.ports import EventBus, Notifier

log = logging.getLogger("evac.notifications")


class LogNotifier:
    """Default channel: structured log line (stands in for SMS/push)."""

    channel = "log"

    async def send_alert(self, alert: Alert) -> None:
        log.warning(
            "ALERT #%s [%s/%s] zone=%s: %s",
            alert.id, alert.severity.value, alert.rule_id, alert.zone_id, alert.message,
        )


class NotificationDispatcher:
    """Bus subscriber fanning `AlertRaised` out to every channel."""

    def __init__(self, channels: list[Notifier]) -> None:
        self._channels = channels

    def attach(self, bus: EventBus) -> None:
        bus.subscribe(AlertRaised, self._on_alert)

    async def _on_alert(self, event: DomainEvent) -> None:
        assert isinstance(event, AlertRaised)
        for channel in self._channels:
            try:
                await channel.send_alert(event.alert)
            except Exception:  # noqa: BLE001 - one broken channel must not stop the rest
                log.exception("Notification channel '%s' failed", channel.channel)
