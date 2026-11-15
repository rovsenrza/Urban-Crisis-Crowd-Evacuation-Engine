"""Ports: the interfaces the application core depends on.

Adapters (in-process bus, Redis/Kafka bus, simulated/OSRM routing, SMS/push
notifiers …) implement these; services never import an adapter directly.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable, Protocol, Sequence, runtime_checkable

from .events import DomainEvent
from .geo import GeoPoint
from .models import Alert, Route

EventHandler = Callable[[DomainEvent], Awaitable[None]]


@runtime_checkable
class EventBus(Protocol):
    def subscribe(self, event_type: type[DomainEvent] | None, handler: EventHandler) -> None:
        """Register a handler. `None` subscribes to every event."""

    async def publish(self, event: DomainEvent) -> None: ...


@runtime_checkable
class RoutingProvider(Protocol):
    name: str

    def routes_to_many(
        self,
        origin: GeoPoint,
        destinations: Sequence[GeoPoint],
        closed_edge_ids: frozenset[str] = frozenset(),
    ) -> list[Route | None]:
        """One route per destination, `None` when there is no path."""

    def route(
        self,
        origin: GeoPoint,
        destination: GeoPoint,
        closed_edge_ids: frozenset[str] = frozenset(),
    ) -> Route | None: ...


class RoutingUnavailable(Exception):
    """The provider could not answer at all (HTTP 5xx, transport error, timeout).

    Different from "no path", which is a valid answer (`None`).
    """


FALLBACK_CACHE = "cache"
FALLBACK_LOCAL_GRAPH = "local_graph"
FALLBACK_STATIC_MATRIX = "static_matrix"


@dataclass(frozen=True)
class RoutingStatus:
    """Health of route computation, reported by providers that have a fallback."""

    provider: str
    mode: str = "live"  # live | fallback
    breaker: str = "closed"  # closed | open | half_open
    fallback_source: str | None = None  # cache | local_graph | static_matrix


def routing_status(provider: RoutingProvider) -> RoutingStatus:
    """Status of any provider; one without a fallback is always live."""
    status = getattr(provider, "status", None)
    return status() if callable(status) else RoutingStatus(provider=provider.name)


class Clock(Protocol):
    def now(self) -> datetime: ...


class Notifier(Protocol):
    """Outbound notification channel (log, SMS, push, e-mail …)."""

    channel: str

    async def send_alert(self, alert: Alert) -> None: ...
