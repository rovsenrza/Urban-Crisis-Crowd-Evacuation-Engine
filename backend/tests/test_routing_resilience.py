"""External routing API outage: circuit breaker, local fallback, "offline backup route mode"."""
from __future__ import annotations

from datetime import timedelta

import httpx
from fastapi.testclient import TestClient

from app.adapters.routing.osrm import OSRMRoutingProvider
from app.adapters.routing.resilient import (
    CLOSED,
    HALF_OPEN,
    OPEN,
    ResilientRoutingProvider,
    StaticMatrixProvider,
)
from app.adapters.routing.simulated import SimulatedRoutingProvider
from app.container import build_container
from app.domain.geo import GeoPoint, haversine_m
from app.domain.ports import RoutingProvider, RoutingUnavailable, routing_status
from app.factory import create_app

from .conftest import FakeClock, make_settings, new_citizen
from .test_routing import DESTINATION, ORIGIN, SQUARE

OSRM_OK = {"code": "Ok", "routes": [
    {"distance": 1234.5, "geometry": {"coordinates": [[49.80, 40.40], [49.81, 40.41]]}}]}


class FlakyApi:
    """A fake OSRM server whose behaviour the test switches: ok | 503 | timeout."""

    def __init__(self, behaviour: str = "ok") -> None:
        self.behaviour = behaviour
        self.calls = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        if self.behaviour == "503":
            return httpx.Response(503)
        if self.behaviour == "timeout":
            raise httpx.ReadTimeout("no answer within 5 s", request=request)
        return httpx.Response(200, json=OSRM_OK)


def make_provider(api: FlakyApi, clock: FakeClock, local: RoutingProvider | None = None,
                  threshold: int = 3) -> ResilientRoutingProvider:
    primary = OSRMRoutingProvider(
        "http://osrm", client=httpx.Client(transport=httpx.MockTransport(api)), raise_on_failure=True)
    if local is None:
        local = SimulatedRoutingProvider(SQUARE)
    return ResilientRoutingProvider(primary, local, clock, failure_threshold=threshold, reset_s=30)


def test_osrm_outage_raises_only_when_asked_and_only_for_outages():
    def strict(handler) -> OSRMRoutingProvider:
        return OSRMRoutingProvider(
            "http://osrm", client=httpx.Client(transport=httpx.MockTransport(handler)), raise_on_failure=True)

    for behaviour in ("503", "timeout"):
        try:
            strict(FlakyApi(behaviour)).route(ORIGIN, DESTINATION)
        except RoutingUnavailable:
            continue
        raise AssertionError(f"{behaviour} must count as an outage")
    # "No route" and a client error are answers, not outages.
    assert strict(lambda r: httpx.Response(200, json={"code": "NoRoute", "routes": []})).route(ORIGIN, DESTINATION) is None
    assert strict(lambda r: httpx.Response(400)).route(ORIGIN, DESTINATION) is None


def test_live_while_the_external_api_answers(clock: FakeClock):
    provider = make_provider(FlakyApi("ok"), clock)
    route = provider.route(ORIGIN, DESTINATION)
    assert route is not None and route.distance_m == 1234.5
    status = provider.status()
    assert (status.mode, status.breaker, status.fallback_source) == ("live", CLOSED, None)


def test_503_falls_back_to_the_local_road_graph_without_an_error(clock: FakeClock):
    provider = make_provider(FlakyApi("503"), clock)
    route = provider.route(ORIGIN, DESTINATION)
    assert route is not None and route.edge_ids == ["e12", "e24"]  # computed on the local graph
    status = provider.status()
    assert (status.mode, status.fallback_source) == ("fallback", "local_graph")


def test_timeout_falls_back_too(clock: FakeClock):
    provider = make_provider(FlakyApi("timeout"), clock)
    assert provider.route(ORIGIN, DESTINATION) is not None
    assert provider.status().mode == "fallback"


def test_circuit_opens_after_repeated_failures_and_stops_calling_the_api(clock: FakeClock):
    api = FlakyApi("503")
    provider = make_provider(api, clock, threshold=3)
    for _ in range(3):
        assert provider.route(ORIGIN, DESTINATION) is not None
    assert provider.status().breaker == OPEN and api.calls == 3
    # Open circuit: answered locally at once, the dead API is not asked (no waiting for a timeout).
    for _ in range(5):
        assert provider.route(ORIGIN, DESTINATION) is not None
    assert api.calls == 3


def test_half_open_trial_closes_the_circuit_when_the_api_is_back(clock: FakeClock):
    api = FlakyApi("503")
    provider = make_provider(api, clock, threshold=2)
    provider.route(ORIGIN, DESTINATION)
    provider.route(ORIGIN, DESTINATION)
    assert provider.status().breaker == OPEN

    clock.current += timedelta(seconds=31)
    assert provider.status().breaker == HALF_OPEN
    api.behaviour = "ok"
    route = provider.route(ORIGIN, DESTINATION)
    assert route is not None and route.distance_m == 1234.5
    status = provider.status()
    assert (status.mode, status.breaker) == ("live", CLOSED)


def test_failed_trial_reopens_the_circuit_for_another_pause(clock: FakeClock):
    api = FlakyApi("503")
    provider = make_provider(api, clock, threshold=2)
    provider.route(ORIGIN, DESTINATION)
    provider.route(ORIGIN, DESTINATION)
    clock.current += timedelta(seconds=31)
    provider.route(ORIGIN, DESTINATION)  # the one trial, still 503
    assert provider.status().breaker == OPEN and api.calls == 3
    provider.route(ORIGIN, DESTINATION)
    assert api.calls == 3  # waits for the next pause


def test_last_cached_route_is_served_first(clock: FakeClock):
    api = FlakyApi("ok")
    provider = make_provider(api, clock)
    live = provider.route(ORIGIN, DESTINATION)
    api.behaviour = "503"
    cached = provider.route(ORIGIN, DESTINATION)
    assert cached == live
    assert provider.status().fallback_source == "cache"


def test_cached_route_is_not_reused_after_roads_close(clock: FakeClock):
    api = FlakyApi("ok")
    provider = make_provider(api, clock)
    provider.route(ORIGIN, DESTINATION)
    api.behaviour = "503"
    route = provider.route(ORIGIN, DESTINATION, frozenset({"e12"}))
    # The cached line may cross the closed road, so the local graph answers and avoids it.
    assert route is not None and route.edge_ids == ["e13", "e34"]
    assert provider.status().fallback_source == "local_graph"


def test_static_matrix_is_the_last_resort_when_the_local_graph_fails(clock: FakeClock):
    class BrokenGraph:
        name = "broken"

        def route(self, *args, **kwargs):
            raise RuntimeError("road tables unreadable")

        def routes_to_many(self, *args, **kwargs):
            raise RuntimeError("road tables unreadable")

    provider = make_provider(FlakyApi("timeout"), clock, local=BrokenGraph())
    route = provider.route(ORIGIN, DESTINATION)
    straight = haversine_m(ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng)
    assert route is not None and route.geometry == [(40.40, 49.80), (40.41, 49.81)]
    assert abs(route.distance_m - straight * 1.35) < 1
    assert provider.status().fallback_source == "static_matrix"
    assert StaticMatrixProvider(2.0).route(ORIGIN, DESTINATION).distance_m > route.distance_m


def test_blocked_roads_still_mean_no_route_in_fallback(clock: FakeClock):
    provider = make_provider(FlakyApi("503"), clock)
    # Every way out is closed: the honest answer is "no route", not a straight line through closures.
    assert provider.route(ORIGIN, DESTINATION, frozenset({"e12", "e13"})) is None


def test_default_local_provider_has_no_breaker_and_is_always_live(container):
    status = routing_status(container.routing)
    assert (status.mode, status.breaker) == ("live", CLOSED)


def test_citizen_keeps_getting_a_plan_marked_as_fallback(clock: FakeClock):
    """End to end: the API answers 200 with a real street route and `routing_mode: fallback`."""
    probe = build_container(make_settings(), clock=clock)
    with probe.uow() as uow:
        from app.domain.models import RoadGraph
        graph = RoadGraph(uow.roads.nodes(), uow.roads.edges())
    api = FlakyApi("503")
    routing = make_provider(api, clock, local=SimulatedRoutingProvider(graph), threshold=2)
    container = build_container(make_settings(), clock=clock, routing=routing)
    citizen = new_citizen()

    with TestClient(create_app(container.settings, container)) as client:
        response = client.post(f"/api/v1/citizens/{citizen}/route", json={"zone_id": "yasamal"})
        assert response.status_code == 200
        plan = response.json()
        assert plan["routing_mode"] == "fallback" and plan["fallback_source"] == "local_graph"
        assert plan["reachable"] and plan["options"][0]["edge_ids"]  # a street route, not a guess

        client.post(f"/api/v1/citizens/{citizen}/route", json={"zone_id": "yasamal"})
        health = client.get("/api/v1/health").json()["routing"]
        assert health == {"provider": "osrm", "mode": "fallback", "breaker": "open",
                          "fallback_source": "local_graph"}

        # The API recovers: after the pause the next plan is live again.
        api.behaviour = "ok"
        clock.current += timedelta(seconds=31)
        plan = client.post(f"/api/v1/citizens/{citizen}/route", json={"zone_id": "yasamal"}).json()
        assert plan["routing_mode"] == "live" and plan["fallback_source"] is None
