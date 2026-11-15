"""Routing provider + evacuation planning."""
from __future__ import annotations

import httpx

from app.adapters.routing.factory import build_routing_provider
from app.adapters.routing.osrm import OSRMRoutingProvider
from app.adapters.routing.simulated import SimulatedRoutingProvider
from app.domain.evacuation import EvacuationOption, choose_recommended
from app.domain.geo import GeoPoint
from app.domain.models import AssemblyKind, AssemblyPoint, RoadEdge, RoadGraph, RoadNode, Thresholds
from app.domain.ports import RoutingProvider

from .conftest import make_settings, new_citizen

#   n3 ── e34 ── n4
#   │            │        short way n1→n4: e12 + e24 (2000 m)
#  e13          e24       long way:        e13 + e34 (3000 m)
#   │            │
#   n1 ── e12 ── n2
SQUARE = RoadGraph(
    nodes=[RoadNode("n1", 40.40, 49.80), RoadNode("n2", 40.40, 49.81),
           RoadNode("n3", 40.41, 49.80), RoadNode("n4", 40.41, 49.81)],
    edges=[RoadEdge("e12", "A", "n1", "n2", 1000), RoadEdge("e24", "B", "n2", "n4", 1000),
           RoadEdge("e13", "C", "n1", "n3", 1500), RoadEdge("e34", "D", "n3", "n4", 1500)],
)
ORIGIN, DESTINATION = GeoPoint(40.40, 49.80), GeoPoint(40.41, 49.81)


def test_shortest_route_is_chosen():
    route = SimulatedRoutingProvider(SQUARE).route(ORIGIN, DESTINATION)
    assert route is not None
    assert route.edge_ids == ["e12", "e24"]
    assert route.distance_m == 2000
    assert route.geometry[0] == (40.40, 49.80) and route.geometry[-1] == (40.41, 49.81)


def test_route_joins_the_network_mid_segment_without_backtracking():
    # Standing 30 % along e12: the route must not go back to n1 first.
    origin = GeoPoint(40.40, 49.803)
    route = SimulatedRoutingProvider(SQUARE).route(origin, DESTINATION)
    assert route is not None and route.edge_ids == ["e12", "e24"]
    assert abs(route.distance_m - 1700) < 1  # 70 % of e12 + all of e24
    assert (40.40, 49.80) not in route.geometry


def test_route_avoids_closed_edges():
    route = SimulatedRoutingProvider(SQUARE).route(ORIGIN, DESTINATION, frozenset({"e24"}))
    assert route is not None
    assert route.edge_ids == ["e13", "e34"]
    assert route.distance_m == 3000


def test_no_path_returns_none():
    provider = SimulatedRoutingProvider(SQUARE)
    assert provider.route(ORIGIN, DESTINATION, frozenset({"e12", "e13"})) is None
    assert provider.routes_to_many(ORIGIN, [DESTINATION], frozenset({"e24", "e34"})) == [None]


def test_providers_implement_the_port():
    assert isinstance(SimulatedRoutingProvider(SQUARE), RoutingProvider)
    osrm = build_routing_provider(make_settings(routing_provider="osrm"), SQUARE)
    assert isinstance(osrm, OSRMRoutingProvider) and isinstance(osrm, RoutingProvider)


def test_osrm_adapter_parses_response_and_survives_failures():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "/route/v1/foot/49.8,40.4;49.81,40.41" in str(request.url)
        return httpx.Response(200, json={"code": "Ok", "routes": [
            {"distance": 1234.5, "geometry": {"coordinates": [[49.80, 40.40], [49.81, 40.41]]}}]})

    ok = OSRMRoutingProvider("http://osrm", client=httpx.Client(transport=httpx.MockTransport(handler)))
    route = ok.route(ORIGIN, DESTINATION)
    assert route is not None and route.distance_m == 1234.5
    assert route.geometry == [(40.40, 49.80), (40.41, 49.81)]  # converted to (lat, lng)

    down = OSRMRoutingProvider("http://osrm", client=httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(503))))
    assert down.route(ORIGIN, DESTINATION) is None


CURVED = RoadGraph(
    nodes=[RoadNode("a", 40.400, 49.800), RoadNode("b", 40.400, 49.820), RoadNode("c", 40.410, 49.820)],
    edges=[
        # A street that bends north halfway: its polyline is not the straight chord a–b.
        RoadEdge("bend", "Əyri küçə", "a", "b", 2500,
                 geometry=[(40.400, 49.800), (40.405, 49.810), (40.400, 49.820)]),
        RoadEdge("side", "Yan küçə", "b", "c", 1112, geometry=[(40.400, 49.820), (40.410, 49.820)]),
    ],
)


def test_route_follows_street_geometry_not_straight_lines():
    route = SimulatedRoutingProvider(CURVED).route(GeoPoint(40.400, 49.800), GeoPoint(40.410, 49.820))
    assert route is not None and route.edge_ids == ["bend", "side"]
    assert (40.405, 49.810) in route.geometry  # the bend is part of the drawn line
    assert route.distance_m == 3612


def test_position_joins_the_nearest_point_of_a_street():
    # 100 m south of the first half of the bent street.
    origin = GeoPoint(40.4016, 49.8050)
    route = SimulatedRoutingProvider(CURVED).route(origin, GeoPoint(40.400, 49.820))
    assert route is not None and route.edge_ids == ["bend"]
    joined = route.geometry[1]
    assert joined != (40.400, 49.800)  # not sent back to the junction
    assert 40.4020 < joined[0] < 40.4030 and 49.8040 < joined[1] < 49.8055  # on the street itself


def test_closed_street_next_to_origin_does_not_trap_in_dead_end():
    #   pocket ── p            The nearest street to the origin is a dead end
    #             │ (closed)   once `link` is closed; the route must start on
    #   a ─────── b ─── c      the main street instead.
    graph = RoadGraph(
        nodes=[RoadNode("a", 40.400, 49.800), RoadNode("b", 40.400, 49.810), RoadNode("c", 40.400, 49.820),
               RoadNode("p", 40.402, 49.810), RoadNode("q", 40.402, 49.806)],
        edges=[RoadEdge("main1", "M", "a", "b", 850), RoadEdge("main2", "M", "b", "c", 850),
               RoadEdge("link", "L", "b", "p", 220), RoadEdge("pocket", "P", "p", "q", 340)],
    )
    provider = SimulatedRoutingProvider(graph)
    origin, destination = GeoPoint(40.4019, 49.808), GeoPoint(40.400, 49.820)
    assert provider.route(origin, destination).edge_ids[0] == "pocket"
    detour = provider.route(origin, destination, frozenset({"link"}))
    assert detour is not None and set(detour.edge_ids) <= {"main1", "main2"}


def test_place_far_from_any_street_is_unreachable():
    assert SimulatedRoutingProvider(SQUARE).route(GeoPoint(40.50, 49.80), DESTINATION) is None


def option(point_id: int, pct: int, distance: float) -> EvacuationOption:
    point = AssemblyPoint(point_id, f"P{point_id}", AssemblyKind.PARK, 40.4, 49.8, 100, pct,
                          True, False, "nesimi")
    return EvacuationOption(point, distance, 0, [], [], "green")


def test_recommended_skips_points_at_or_above_reroute_limit():
    options = [option(1, 90, 100), option(2, 89, 200), option(3, 10, 300)]
    assert choose_recommended(options, Thresholds()) == (2, False)


def test_recommended_falls_back_to_nearest_when_everything_is_full():
    assert choose_recommended([option(1, 95, 100), option(2, 92, 200)], Thresholds()) == (1, True)
    assert choose_recommended([], Thresholds()) == (None, False)


# --- with the seeded Baku graph ----------------------------------------------

def test_options_sorted_by_route_distance_with_eta_and_colour(container):
    plan = container.evacuation.plan(None, None, "yasamal")
    distances = [o.distance_m for o in plan.options]
    assert plan.reachable and distances == sorted(distances)
    assert plan.recommended_point_id == plan.options[0].point.id
    assert all(o.point.is_active for o in plan.options)
    first = plan.options[0]
    assert first.eta_s == round(first.distance_m / container.settings.walk_speed_mps)
    assert first.level in {"green", "yellow", "red"}


async def test_plan_route_avoids_closed_edge(container):
    before = container.evacuation.plan(None, None, "yasamal").options[0]
    closed = before.edge_ids[0]
    await container.roads.set_open(closed, False)
    after = container.evacuation.plan(None, None, "yasamal")
    assert all(closed not in o.edge_ids for o in after.options)
    same_point = after.option(before.point.id)
    assert same_point is not None and same_point.distance_m >= before.distance_m


async def test_alternative_point_chosen_when_target_is_90_percent_full(container):
    plan = container.evacuation.plan(None, None, "yasamal")
    nearest, second = plan.options[0].point, plan.options[1].point
    await container.assembly.set_occupancy(nearest.id, occupancy_pct=89)
    assert container.evacuation.plan(None, None, "yasamal").recommended_point_id == nearest.id
    await container.assembly.set_occupancy(nearest.id, occupancy_pct=90)
    replanned = container.evacuation.plan(None, None, "yasamal")
    assert replanned.recommended_point_id == second.id
    assert replanned.option(nearest.id).level == "yellow"  # still listed, just not recommended


async def test_no_path_gives_graceful_empty_plan(container):
    for edge in container.roads.graph().edges:
        await container.roads.set_open(edge.id, False)
    plan = container.evacuation.track(new_citizen(), zone_id="yasamal")
    assert plan.reachable is False
    assert plan.options == [] and plan.recommended_point_id is None
    assert plan.selected_point_id is None


def test_inactive_reserve_points_are_not_offered(container):
    plan = container.evacuation.plan(None, None, "sebail", limit=20)
    assert all(not o.point.name.endswith("(ehtiyat)") for o in plan.options)
