"""Circuit breaker and local fallback around an external routing provider.

The external map/routing API can answer 503 or not answer at all. Evacuation
routing must keep working, so this wrapper:

1. counts failures of the primary provider (`RoutingUnavailable`: HTTP 5xx,
   transport error, timeout) and *opens the circuit* after a few in a row.
   While it is open no request is sent, so nobody waits for a timeout;
2. after a pause lets one trial request through (*half-open*); success closes
   the circuit, failure opens it again;
3. answers from local data whenever the primary cannot:
   a. the last cached route for the same origin and destination,
   b. the local road graph stored in the database (honours closed roads and
      the barrier-free profile),
   c. a static coordinate matrix: straight-line distance between stored
      coordinates times a detour factor. Only used when the local graph
      itself cannot be used.

`status()` tells callers whether the last answer was live or a fallback, so
the plan can carry "offline backup route mode" to the citizen.
"""
from __future__ import annotations

import logging
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Sequence

from ...domain.geo import GeoPoint, haversine_m
from ...domain.models import Route
from ...domain.ports import (
    FALLBACK_CACHE,
    FALLBACK_LOCAL_GRAPH,
    FALLBACK_STATIC_MATRIX,
    Clock,
    RoutingProvider,
    RoutingStatus,
    RoutingUnavailable,
)

log = logging.getLogger(__name__)

CLOSED, OPEN, HALF_OPEN = "closed", "open", "half_open"
# Weakest source first: a plan reports the least reliable source it used.
_SOURCE_RANK = {FALLBACK_STATIC_MATRIX: 0, FALLBACK_CACHE: 1, FALLBACK_LOCAL_GRAPH: 2}
# 4 decimals of a degree is about 10 m: the same doorway maps to the same key.
_KEY_PRECISION = 4


class CircuitBreaker:
    """Closed → open after `failure_threshold` failures in a row → half-open after `reset_s`."""

    def __init__(self, clock: Clock, failure_threshold: int = 3, reset_s: float = 30.0) -> None:
        self._clock = clock
        self._threshold = max(1, failure_threshold)
        self._reset = timedelta(seconds=reset_s)
        self._failures = 0
        self._opened_at: datetime | None = None
        self._trial_running = False

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return CLOSED
        return HALF_OPEN if self._clock.now() - self._opened_at >= self._reset else OPEN

    def allow_request(self) -> bool:
        state = self.state
        if state == CLOSED:
            return True
        if state == HALF_OPEN and not self._trial_running:
            self._trial_running = True  # exactly one trial request
            return True
        return False

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None
        self._trial_running = False

    def record_failure(self) -> None:
        self._failures += 1
        was_trial = self._trial_running
        self._trial_running = False
        if was_trial or self._failures >= self._threshold:
            self._opened_at = self._clock.now()


class StaticMatrixProvider:
    """Last resort: distances from stored coordinates only, no street geometry."""

    name = "static_matrix"

    def __init__(self, detour_factor: float = 1.35) -> None:
        self._detour = detour_factor

    def route(self, origin: GeoPoint, destination: GeoPoint,
              closed_edge_ids: frozenset[str] = frozenset()) -> Route | None:
        straight = haversine_m(origin.lat, origin.lng, destination.lat, destination.lng)
        return Route(round(straight * self._detour, 1),
                     [(origin.lat, origin.lng), (destination.lat, destination.lng)], [])

    def routes_to_many(self, origin: GeoPoint, destinations: Sequence[GeoPoint],
                       closed_edge_ids: frozenset[str] = frozenset()) -> list[Route | None]:
        return [self.route(origin, destination) for destination in destinations]


@dataclass
class _Cached:
    route: Route
    blocked: frozenset[str]


class ResilientRoutingProvider:
    """`RoutingProvider` that never fails: primary behind a breaker, then local fallbacks."""

    def __init__(self, primary: RoutingProvider, local: RoutingProvider | None, clock: Clock,
                 failure_threshold: int = 3, reset_s: float = 30.0,
                 static: RoutingProvider | None = None, cache_size: int = 2000) -> None:
        self.name = primary.name
        self._primary = primary
        self._local = local
        self._static = static or StaticMatrixProvider()
        self._breaker = CircuitBreaker(clock, failure_threshold, reset_s)
        self._cache: OrderedDict[tuple[float, float, float, float], _Cached] = OrderedDict()
        self._cache_size = cache_size
        self._last_source: str | None = None

    # -- RoutingProvider -----------------------------------------------------

    def routes_to_many(self, origin: GeoPoint, destinations: Sequence[GeoPoint],
                       closed_edge_ids: frozenset[str] = frozenset()) -> list[Route | None]:
        if self._breaker.allow_request():
            try:
                routes = self._primary.routes_to_many(origin, destinations, closed_edge_ids)
            except RoutingUnavailable as exc:
                self._breaker.record_failure()
                log.warning("Routing provider '%s' unavailable (%s); circuit is %s, using fallback",
                            self.name, exc, self._breaker.state)
            else:
                self._breaker.record_success()
                self._last_source = None
                for destination, route in zip(destinations, routes):
                    self._remember(origin, destination, route, closed_edge_ids)
                return routes
        return self._fallback(origin, destinations, closed_edge_ids)

    def route(self, origin: GeoPoint, destination: GeoPoint,
              closed_edge_ids: frozenset[str] = frozenset()) -> Route | None:
        return self.routes_to_many(origin, [destination], closed_edge_ids)[0]

    # -- health ----------------------------------------------------------------

    def status(self) -> RoutingStatus:
        """Whether the most recent answer was live, and the breaker's state now."""
        return RoutingStatus(
            provider=self.name,
            mode="fallback" if self._last_source else "live",
            breaker=self._breaker.state,
            fallback_source=self._last_source,
        )

    # -- internals -------------------------------------------------------------

    def _fallback(self, origin: GeoPoint, destinations: Sequence[GeoPoint],
                  blocked: frozenset[str]) -> list[Route | None]:
        routes: list[Route | None] = [None] * len(destinations)
        used: set[str] = set()
        missing: list[int] = []
        for index, destination in enumerate(destinations):
            cached = self._cache.get(self._key(origin, destination))
            # A cached line may cross a road closed since; only reuse it while closures are unchanged.
            if cached and cached.blocked == blocked:
                routes[index] = cached.route
                used.add(FALLBACK_CACHE)
            else:
                missing.append(index)

        if missing:
            targets = [destinations[i] for i in missing]
            source = FALLBACK_LOCAL_GRAPH
            try:
                if self._local is None:
                    raise RoutingUnavailable("no local road graph")
                answers = self._local.routes_to_many(origin, targets, blocked)
            except Exception as exc:  # the fallback of the fallback must not fail either
                log.error("Local road graph unusable (%s); using the static coordinate matrix", exc)
                source = FALLBACK_STATIC_MATRIX
                answers = self._static.routes_to_many(origin, targets, blocked)
            used.add(source)
            for index, answer in zip(missing, answers):
                routes[index] = answer

        self._last_source = min(used, key=_SOURCE_RANK.__getitem__) if used else FALLBACK_LOCAL_GRAPH
        return routes

    def _remember(self, origin: GeoPoint, destination: GeoPoint, route: Route | None,
                  blocked: frozenset[str]) -> None:
        if route is None:
            return
        key = self._key(origin, destination)
        self._cache[key] = _Cached(route, blocked)
        self._cache.move_to_end(key)
        while len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)

    @staticmethod
    def _key(origin: GeoPoint, destination: GeoPoint) -> tuple[float, float, float, float]:
        return (round(origin.lat, _KEY_PRECISION), round(origin.lng, _KEY_PRECISION),
                round(destination.lat, _KEY_PRECISION), round(destination.lng, _KEY_PRECISION))
