"""In-process pub/sub implementation of the `EventBus` port.

Swap for Redis/Kafka by writing another class with the same two methods and
changing one line in `container.py`.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from ...domain.events import DomainEvent
from ...domain.ports import EventHandler

log = logging.getLogger(__name__)


class InProcessEventBus:
    def __init__(self) -> None:
        self._handlers: dict[type[DomainEvent] | None, list[EventHandler]] = defaultdict(list)

    def subscribe(self, event_type: type[DomainEvent] | None, handler: EventHandler) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event: DomainEvent) -> None:
        """Deliver to catch-all handlers first, then to type-specific ones.

        Catch-all subscribers (WebSocket bridge, alert engine) see the event
        before reactions to it (e.g. re-routing) publish follow-up events, so
        clients receive messages in causal order.

        Handlers run sequentially and are isolated: one failing subscriber
        must never block SOS processing for the others.
        """
        for handler in [*self._handlers[None], *self._handlers[type(event)]]:
            try:
                await handler(event)
            except Exception:  # noqa: BLE001 - isolation boundary
                log.exception("Event handler failed for %s", event.name)
