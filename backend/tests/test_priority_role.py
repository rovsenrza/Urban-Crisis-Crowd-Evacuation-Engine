"""Mobility-impaired role: Priority #1 SOS and barrier-free evacuation routes."""
from __future__ import annotations

import networkx as nx
from sqlalchemy import text

from app.adapters.db.seed import INACCESSIBLE_POINTS, build_baku_graph, load_road_graph
from app.adapters.db.session import ensure_schema, make_engine, schema_is_current
from app.domain.events import CitizenRerouted, SOSCreated
from app.domain.roles import CitizenRole, SOSPriority, normalize_role, policy_for

from .conftest import TOKEN, new_citizen

API = "/api/v1"
YASAMAL = (40.3830, 49.8100)
PRIORITY = CitizenRole.MOBILITY_IMPAIRED


def barriers(container) -> set[str]:
    return {e.id for e in container.roads.graph().edges if not e.is_accessible}


# --- role policy ---------------------------------------------------------------

def test_role_policies():
    assert policy_for(CitizenRole.STANDARD).sos_priority is SOSPriority.NORMAL
    assert policy_for(CitizenRole.STANDARD).accessible_route is False
    assert policy_for(PRIORITY).sos_priority is SOSPriority.CRITICAL
    assert policy_for("mobility_impaired").accessible_route is True
    # Unknown / missing roles fall back to the standard behaviour.
    assert policy_for("astronaut") == policy_for(None) == policy_for(CitizenRole.STANDARD)
    assert normalize_role("astronaut") is CitizenRole.STANDARD


# --- Priority SOS --------------------------------------------------------------

async def test_standard_sos_has_normal_priority(container):
    sos, _ = await container.sos.create(new_citizen(), *YASAMAL, "fire")
    assert (sos.priority, sos.citizen_role) == (3, "standard")


async def test_mobility_impaired_sos_is_priority_one(container, events):
    sos, _ = await container.sos.create(new_citizen(), *YASAMAL, "medical", PRIORITY)
    assert (sos.priority, sos.citizen_role) == (1, "mobility_impaired")
    assert events.of(SOSCreated)[0].sos.priority == 1


async def test_stored_role_applies_to_later_sos(container, clock):
    citizen = new_citizen()
    # The role is declared once (here: when asking for a route) ...
    container.evacuation.track(citizen, zone_id="yasamal", role=PRIORITY)
    # ... and an SOS sent without a role is still Priority #1.
    sos, _ = await container.sos.create(citizen, *YASAMAL, "fire")
    assert sos.priority == 1
    assert container.evacuation.citizen_state(citizen).role == "mobility_impaired"

    # Switching the role back is honoured as well.
    clock.advance(seconds=61)
    again, _ = await container.sos.create(citizen, *YASAMAL, "fire", CitizenRole.STANDARD)
    assert again.priority == 3


async def test_priority_sos_listed_first(container):
    await container.sos.create(new_citizen(), *YASAMAL, "fire")
    urgent, _ = await container.sos.create(new_citizen(), *YASAMAL, "medical", PRIORITY)
    await container.sos.create(new_citizen(), *YASAMAL, "flood")
    listed = container.sos.list()
    assert listed[0].id == urgent.id
    assert [s.priority for s in listed] == [1, 3, 3]
    assert container.dashboard.snapshot()["stats"]["priority_sos"] == 1


# --- barrier-free routing -------------------------------------------------------

def test_road_network_has_barriers_but_stays_connected_for_wheelchairs():
    graph = load_road_graph()
    blocked = [e for e in graph.edges if not e.is_accessible]
    assert 0.1 <= len(blocked) / len(graph.edges) <= 0.3
    # Main roads are always barrier-free; only smaller streets carry barriers.
    assert all(e.kind not in {"trunk", "primary", "secondary", "tertiary"} for e in blocked)
    network = nx.Graph()
    network.add_nodes_from(n.id for n in graph.nodes)
    network.add_edges_from((e.source, e.target) for e in graph.edges if e.is_accessible)
    assert nx.is_connected(network)


def test_synthetic_fallback_grid_is_robust_for_wheelchairs():
    graph = build_baku_graph()
    network = nx.Graph()
    network.add_edges_from((e.source, e.target) for e in graph.edges if e.is_accessible)
    assert nx.is_connected(network) and not nx.has_bridges(network)


def test_accessible_plan_uses_only_barrier_free_roads_and_points(container):
    blocked = barriers(container)
    plan = container.evacuation.plan(None, None, "yasamal", limit=20, role=PRIORITY)

    assert plan.accessible is True and plan.reachable
    assert all(o.point.is_accessible for o in plan.options)
    assert all(o.point.name not in INACCESSIBLE_POINTS for o in plan.options)
    assert all(blocked.isdisjoint(o.edge_ids) for o in plan.options)
    assert [o.distance_m for o in plan.options] == sorted(o.distance_m for o in plan.options)


def test_accessible_plan_differs_from_standard_plan(container):
    standard = container.evacuation.plan(None, None, "yasamal", limit=20)
    accessible = container.evacuation.plan(None, None, "yasamal", limit=20, role=PRIORITY)

    assert standard.accessible is False
    # The nearest point for everyone else has no barrier-free entrance.
    assert standard.selected.point.name in INACCESSIBLE_POINTS
    assert accessible.selected_point_id != standard.selected_point_id
    assert len(accessible.options) == len(standard.options) - len(
        [o for o in standard.options if not o.point.is_accessible])
    # A detour around barriers is never shorter than the unrestricted route.
    same_point = standard.option(accessible.selected_point_id)
    assert accessible.selected.distance_m >= same_point.distance_m


def test_accessible_eta_uses_slower_speed(container):
    option = container.evacuation.plan(None, None, "yasamal", role=PRIORITY).selected
    assert option.eta_s == round(option.distance_m / container.settings.accessible_speed_mps)
    assert container.settings.accessible_speed_mps < container.settings.walk_speed_mps


async def test_accessible_route_also_avoids_closed_roads(container):
    citizen = new_citizen()
    plan = container.evacuation.track(citizen, zone_id="yasamal", role=PRIORITY)
    closed = plan.selected.edge_ids[0]
    await container.roads.set_open(closed, False)
    replanned = container.evacuation.plan(None, None, "yasamal", limit=20, role=PRIORITY)
    forbidden = barriers(container) | {closed}
    assert all(forbidden.isdisjoint(o.edge_ids) for o in replanned.options)


async def test_no_accessible_path_is_graceful(container):
    for edge in container.roads.graph().edges:
        if edge.is_accessible:
            await container.roads.set_open(edge.id, False)
    accessible = container.evacuation.track(new_citizen(), zone_id="yasamal", role=PRIORITY)
    assert accessible.reachable is False and accessible.options == []
    assert accessible.selected_point_id is None and accessible.accessible is True


async def test_rerouting_keeps_the_barrier_free_profile(container, events):
    citizen = new_citizen()
    plan = container.evacuation.track(citizen, zone_id="yasamal", role=PRIORITY)
    await container.roads.set_open(plan.selected.edge_ids[0], False)

    [event] = events.of(CitizenRerouted)
    assert event.citizen_id == citizen and event.plan.accessible is True
    assert event.plan.selected.point.is_accessible
    assert barriers(container).isdisjoint(event.plan.selected.edge_ids)


async def test_full_point_reroutes_priority_citizen_to_accessible_point(container, events):
    citizen = new_citizen()
    plan = container.evacuation.track(citizen, zone_id="yasamal", role=PRIORITY)
    await container.assembly.set_occupancy(plan.selected_point_id, occupancy_pct=92)

    [event] = events.of(CitizenRerouted)
    assert event.plan.selected_point_id != plan.selected_point_id
    assert event.plan.selected.point.is_accessible and event.plan.accessible


# --- API ------------------------------------------------------------------------

def test_api_priority_sos_and_state(client, auth):
    citizen = new_citizen()
    body = {"citizen_id": citizen, "lat": YASAMAL[0], "lng": YASAMAL[1],
            "hazard_type": "medical", "role": "mobility_impaired"}
    with client.websocket_connect(f"/ws/operator?token={TOKEN}") as ws:
        created = client.post(f"{API}/sos", json=body)
        assert created.status_code == 201
        assert created.json()["sos"]["priority"] == 1
        assert created.json()["sos"]["citizen_role"] == "mobility_impaired"
        push = ws.receive_json()
        assert push["type"] == "sos.created" and push["data"]["sos"]["priority"] == 1

    assert client.get(f"{API}/citizens/{citizen}/state").json()["role"] == "mobility_impaired"
    client.post(f"{API}/sim/sos", headers=auth, json={"zone_id": "nizami", "count": 2})
    listed = client.get(f"{API}/sos?status=open", headers=auth).json()
    assert [s["priority"] for s in listed] == [1, 3, 3]

    bad = client.post(f"{API}/sos", json={**body, "role": "vip"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "validation_error"


def test_api_accessible_route_and_meta(client, auth):
    roles = {r["code"]: r for r in client.get(f"{API}/meta").json()["roles"]}
    assert roles["mobility_impaired"] == {"code": "mobility_impaired", "sos_priority": 1,
                                          "accessible_route": True}
    assert roles["standard"]["sos_priority"] == 3

    roads = client.get(f"{API}/roads").json()["edges"]
    blocked = {e["id"] for e in roads if not e["is_accessible"]}
    assert blocked

    citizen = new_citizen()
    plan = client.post(f"{API}/citizens/{citizen}/route",
                       json={"zone_id": "yasamal", "role": "mobility_impaired"}).json()
    assert plan["accessible"] is True
    assert all(o["point"]["is_accessible"] for o in plan["options"])
    assert all(blocked.isdisjoint(o["edge_ids"]) for o in plan["options"])
    # A later request without a role keeps the stored one.
    again = client.post(f"{API}/citizens/{citizen}/route", json={"zone_id": "yasamal"}).json()
    assert again["accessible"] is True
    # Read-only query.
    query = client.get(f"{API}/assembly-points/nearest?zone_id=yasamal&role=mobility_impaired")
    assert query.json()["accessible"] is True

    simulated = client.post(f"{API}/sim/sos", headers=auth, json={
        "zone_id": "xetai", "count": 1, "role": "mobility_impaired"}).json()
    assert simulated[0]["priority"] == 1


def test_scenario_includes_priority_sos(client, auth):
    client.post(f"{API}/sim/scenario/earthquake", headers=auth, json={"speed": 0})
    import time
    deadline = time.time() + 10
    while client.get(f"{API}/sim/scenario", headers=auth).json()["running"]:
        assert time.time() < deadline
        time.sleep(0.05)
    signals = client.get(f"{API}/sos", headers=auth).json()
    assert [s["priority"] for s in signals].count(1) == 1
    assert signals[0]["citizen_role"] == "mobility_impaired"


# --- schema upgrade ---------------------------------------------------------------

def test_outdated_database_is_rebuilt(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/old.db")
    with engine.begin() as connection:  # a table from before the role feature
        connection.execute(text("CREATE TABLE sos_signals (id INTEGER PRIMARY KEY, citizen_id TEXT)"))
    assert schema_is_current(engine) is False
    ensure_schema(engine)
    assert schema_is_current(engine) is True
