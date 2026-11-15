"""Automatic re-routing of tracked citizens."""
from __future__ import annotations

from app.domain.events import CitizenRerouted
from app.domain.models import BrigadeStatus

from .conftest import new_citizen, raise_cluster_alert


def track(container, zone_id: str = "yasamal"):
    citizen = new_citizen()
    return citizen, container.evacuation.track(citizen, zone_id=zone_id)


async def test_road_closure_on_route_reroutes_citizen(container, events):
    citizen, plan = track(container)
    closed = plan.selected.edge_ids[0]
    await container.roads.set_open(closed, False)

    [event] = events.of(CitizenRerouted)
    assert event.citizen_id == citizen
    assert event.reason == "road_closed" and event.changed is True
    assert event.detail["edge_id"] == closed
    assert closed not in event.plan.selected.edge_ids
    # The citizen follows the recommendation, so they get the new best point.
    assert event.plan.selected_point_id == event.plan.recommended_point_id
    stored = container.evacuation.citizen_state(citizen)
    assert stored.edge_ids == event.plan.selected.edge_ids
    assert stored.target_point_id == event.plan.selected_point_id


async def test_road_closure_keeps_a_manually_chosen_destination(container, events):
    citizen = new_citizen()
    first = container.evacuation.track(citizen, zone_id="yasamal")
    chosen = first.options[1].point.id
    plan = container.evacuation.track(citizen, zone_id="yasamal", target_point_id=chosen)
    assert container.evacuation.citizen_state(citizen).manual_target is True

    closed = plan.selected.edge_ids[0]
    await container.roads.set_open(closed, False)

    [event] = events.of(CitizenRerouted)
    assert event.plan.selected_point_id == chosen  # same place, new path
    assert closed not in event.plan.selected.edge_ids


async def test_road_closure_elsewhere_does_not_disturb_citizen(container, events):
    _, plan = track(container)
    unrelated = next(e.id for e in container.roads.graph().edges
                     if e.id not in plan.selected.edge_ids)
    await container.roads.set_open(unrelated, False)
    assert events.of(CitizenRerouted) == []


async def test_reopening_a_road_does_not_trigger_reroute(container, events):
    _, plan = track(container)
    unrelated = next(e.id for e in container.roads.graph().edges
                     if e.id not in plan.selected.edge_ids)
    await container.roads.set_open(unrelated, False)
    await container.roads.set_open(unrelated, True)
    assert events.of(CitizenRerouted) == []


async def test_target_reaching_90_percent_switches_assembly_point(container, events):
    citizen, plan = track(container)
    target = plan.selected.point

    await container.assembly.set_occupancy(target.id, occupancy_pct=89)
    assert events.of(CitizenRerouted) == []

    await container.assembly.set_occupancy(target.id, occupancy_pct=90)
    [event] = events.of(CitizenRerouted)
    assert event.reason == "point_full" and event.changed is True
    assert event.previous_point_id == target.id
    assert event.plan.selected_point_id != target.id
    assert event.plan.selected.point.occupancy_pct < 90
    assert event.detail == {"point_id": target.id, "point_name": target.name,
                            "occupancy_pct": 90.0}
    assert container.evacuation.citizen_state(citizen).target_point_id == event.plan.selected_point_id


async def test_citizen_heading_elsewhere_is_not_rerouted_when_point_fills(container, events):
    _, plan = track(container)
    other = next(p for p in container.assembly.list(active_only=True)
                 if p.id != plan.selected_point_id)
    await container.assembly.set_occupancy(other.id, occupancy_pct=93)
    assert events.of(CitizenRerouted) == []


async def test_safe_citizen_is_no_longer_rerouted(container, events):
    citizen, plan = track(container)
    await container.sos.mark_safe(citizen)
    await container.roads.set_open(plan.selected.edge_ids[0], False)
    assert events.of(CitizenRerouted) == []


async def test_explicit_target_choice_is_tracked(container):
    citizen = new_citizen()
    plan = container.evacuation.track(citizen, zone_id="yasamal")
    second = plan.options[1].point.id
    chosen = container.evacuation.track(citizen, zone_id="yasamal", target_point_id=second)
    assert chosen.selected_point_id == second
    assert chosen.recommended_point_id == plan.recommended_point_id
    assert container.evacuation.citizen_state(citizen).target_point_id == second


async def test_alert_confirmation_notifies_citizens_in_the_crisis_zone(container, events):
    inside, _ = track(container, "yasamal")
    track(container, "sabuncu")  # far away: must not be notified
    alert = await raise_cluster_alert(container, "yasamal")

    result = await container.decisions.confirm(alert.id, "operator")

    [event] = events.of(CitizenRerouted)
    assert event.citizen_id == inside and event.reason == "alert_confirmed"
    assert event.detail["activated_point_id"] == result.activated_point.id
    # The newly opened reserve point is now part of the citizen's plan universe.
    full = container.evacuation.plan(None, None, "yasamal", limit=20)
    assert result.activated_point.id in [o.point.id for o in full.options]


async def test_overcrowding_confirmation_moves_citizens_off_the_point(container, events):
    citizen = new_citizen()
    plan = container.evacuation.track(citizen, zone_id="yasamal")
    target = plan.selected.point
    # The citizen insists on this point even though it is filling up.
    await container.assembly.set_occupancy(target.id, occupancy_pct=96)
    container.evacuation.track(citizen, zone_id="yasamal", target_point_id=target.id)
    events.events.clear()

    [alert] = container.decisions.list()
    await container.decisions.confirm(alert.id, "operator")

    [event] = events.of(CitizenRerouted)
    assert event.reason == "alert_confirmed" and event.changed is True
    assert event.plan.selected_point_id != target.id


async def test_brigade_moves_along_route_and_arrives(container):
    alert = await raise_cluster_alert(container)
    result = await container.decisions.confirm(alert.id, "operator")
    start = (result.brigade.lat, result.brigade.lng)

    await container.brigades.tick(1.0)
    moving = next(b for b in container.brigades.list() if b.id == result.brigade.id)
    assert (moving.lat, moving.lng) != start and moving.status is BrigadeStatus.EN_ROUTE

    for _ in range(500):
        await container.brigades.tick(5.0)
    arrived = next(b for b in container.brigades.list() if b.id == result.brigade.id)
    assert arrived.status is BrigadeStatus.ON_SITE
    assert abs(arrived.lat - alert.lat) < 1e-6 and abs(arrived.lng - alert.lng) < 1e-6
