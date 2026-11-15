"""Optional adapter for the public OSRM HTTP API (ROUTING_PROVIDER=osrm).

Limitations (by design of the public API): simulated road closures cannot be
passed to OSRM, so `closed_edge_ids` is ignored and `edge_ids` is empty —
closure-based re-routing only works with the simulated provider. Calls are
synchronous with a short timeout. By default a failure yields "no route";
with `raise_on_failure=True` an outage (HTTP 5xx, transport error, timeout)
raises `RoutingUnavailable`, so a circuit breaker can tell it from "no path".
"""
from __future__ import annotations

import logging
from typing import Sequence

import httpx

from ...domain.geo import GeoPoint
from ...domain.models import Route
from ...domain.ports import RoutingUnavailable

log = logging.getLogger(__name__)


class OSRMRoutingProvider:
    name = "osrm"

    def __init__(self, base_url: str, profile: str = "foot", timeout_s: float = 5.0,
                 client: httpx.Client | None = None, raise_on_failure: bool = False) -> None:
        self._base_url = base_url.rstrip("/")
        self._profile = profile
        self._client = client or httpx.Client(timeout=timeout_s)
        self._raise = raise_on_failure

    def route(
        self,
        origin: GeoPoint,
        destination: GeoPoint,
        closed_edge_ids: frozenset[str] = frozenset(),
    ) -> Route | None:
        coords = f"{origin.lng},{origin.lat};{destination.lng},{destination.lat}"
        url = f"{self._base_url}/route/v1/{self._profile}/{coords}"
        try:
            response = self._client.get(url, params={"overview": "full", "geometries": "geojson"})
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("OSRM request failed: %s", exc)
            # 4xx means this request is wrong, not that the service is down.
            client_error = (isinstance(exc, httpx.HTTPStatusError)
                            and exc.response.status_code < 500)
            if self._raise and not client_error:
                raise RoutingUnavailable(str(exc)) from exc
            return None
        if body.get("code") != "Ok" or not body.get("routes"):
            return None
        best = body["routes"][0]
        # GeoJSON is [lng, lat]; the rest of the system uses (lat, lng).
        geometry = [(lat, lng) for lng, lat in best["geometry"]["coordinates"]]
        return Route(float(best["distance"]), geometry, [])

    def routes_to_many(
        self,
        origin: GeoPoint,
        destinations: Sequence[GeoPoint],
        closed_edge_ids: frozenset[str] = frozenset(),
    ) -> list[Route | None]:
        return [self.route(origin, destination) for destination in destinations]
