"""One-click confirmation: brigade, reserve point, audit, idempotency, atomicity."""
from __future__ import annotations

import pytest

from app.adapters.db.repositories import AuditRepo
from app.domain.errors import Conflict, NotFound, ValidationFailed
from app.domain.events import AlertConfirmed, AssemblyPointActivated, BrigadeStatusChanged
from app.domain.models import AlertStatus, BrigadeStatus

from .conftest import raise_cluster_alert


def route_distance(container, origin, target) -> float:
    route = container.routing.route(origin, target, frozenset())
    assert route is not None
    return route.distance_m


def audit(container, action: str):
    with container.uow() as uow:
        return [e for e in uow.audit.list() if e.action == action]


async def test_confirm_dispatches_nearest_available_brigade(container, events):
    alert = await raise_cluster_alert(container)
    available = [b for b in container.brigades.list() if b.status is BrigadeStatus.AVAILABLE]
    expected = min(available, key=lambda b: route_distance(container, b.position, alert.position))

    result = await container.decisions.confirm(alert.id, "operator")

    assert result.already_processed is False
    assert result.brigade.id == expected.id
    assert result.brigade.status is BrigadeStatus.EN_ROUTE
    assert (result.brigade.target_lat, result.brigade.target_lng) == (alert.lat, alert.lng)
    assert result.brigade.target_alert_id == alert.id
    assert result.brigade.eta_s > 0 and len(result.brigade.route) >= 2
    stored = next(b for b in container.brigades.list() if b.id == expected.id)
    assert stored.status is BrigadeStatus.EN_ROUTE
    assert events.of(BrigadeStatusChanged)[0].brigade.id == expected.id


async def test_busy_brigades_are_never_dispatched(container):
    alert = await raise_cluster_alert(container)
    available = [b for b in container.brigades.list() if b.status is BrigadeStatus.AVAILABLE]
    ranked = sorted(available, key=lambda b: route_distance(container, b.position, alert.position))
    await container.brigades.set_status(ranked[0].id, BrigadeStatus.ON_SITE)

    result = await container.decisions.confirm(alert.id, "operator")
    assert result.brigade.id == ranked[1].id


async def test_confirm_opens_nearest_reserve_point(container, events):
    alert = await raise_cluster_alert(container)
    reserves = [p for p in container.assembly.list() if p.is_reserve]
    assert len(reserves) == 3 and not any(p.is_active for p in reserves)
    expected = min(reserves, key=lambda p: route_distance(container, alert.position, p.position))

    result = await container.decisions.confirm(alert.id, "operator")

    assert result.activated_point.id == expected.id and result.activated_point.is_active
    active_reserves = [p for p in container.assembly.list() if p.is_reserve and p.is_active]
    assert [p.id for p in active_reserves] == [expected.id]
    assert events.of(AssemblyPointActivated)[0].point.id == expected.id
    assert len(events.of(AlertConfirmed)) == 1


async def test_confirm_writes_audit_log(container, clock):
    alert = await raise_cluster_alert(container)
    result = await container.decisions.confirm(alert.id, "operator")

    [entry] = audit(container, "alert.confirmed")
    assert entry.actor == "operator" and entry.alert_id == alert.id
    assert entry.created_at == clock.now()
    assert entry.details["brigade_id"] == result.brigade.id
    assert entry.details["activated_point_id"] == result.activated_point.id
    assert entry.details["rule_id"] == "sos_cluster"
    assert result.alert.status is AlertStatus.CONFIRMED
    assert result.alert.resolved_by == "operator" and result.alert.resolved_at == clock.now()
    # The re-routing subscriber records how many citizens it handled.
    assert len(audit(container, "citizens.rerouted")) == 1


async def test_double_confirmation_is_idempotent(container, events):
    alert = await raise_cluster_alert(container)
    first = await container.decisions.confirm(alert.id, "operator")
    second = await container.decisions.confirm(alert.id, "operator")

    assert second.already_processed is True
    assert second.brigade.id == first.brigade.id
    assert second.activated_point.id == first.activated_point.id
    en_route = [b for b in container.brigades.list() if b.target_alert_id == alert.id]
    assert len(en_route) == 1
    assert len([p for p in container.assembly.list() if p.is_reserve and p.is_active]) == 1
    assert len(audit(container, "alert.confirmed")) == 1
    assert len(events.of(AlertConfirmed)) == 1


async def test_confirmation_is_atomic_on_failure(container, monkeypatch):
    alert = await raise_cluster_alert(container)
    before = container.brigades.list()

    def boom(*args, **kwargs):
        raise RuntimeError("audit storage down")

    monkeypatch.setattr(AuditRepo, "add", boom)
    with pytest.raises(RuntimeError):
        await container.decisions.confirm(alert.id, "operator")
    monkeypatch.undo()

    assert container.brigades.list() == before  # no brigade dispatched
    assert not any(p.is_active for p in container.assembly.list() if p.is_reserve)
    assert container.decisions.list()[0].status is AlertStatus.OPEN


async def test_confirm_overcrowding_alert(container):
    point = container.assembly.list(active_only=True)[1]
    await container.assembly.set_occupancy(point.id, occupancy_pct=97)
    [alert] = container.decisions.list()
    result = await container.decisions.confirm(alert.id, "operator")
    assert result.brigade is not None and result.activated_point is not None
    assert (result.brigade.target_lat, result.brigade.target_lng) == (point.lat, point.lng)


async def test_confirm_without_available_brigade_still_opens_point(container):
    for brigade in container.brigades.list():
        await container.brigades.set_status(brigade.id, BrigadeStatus.ON_SITE)
    alert = await raise_cluster_alert(container)
    result = await container.decisions.confirm(alert.id, "operator")
    assert result.brigade is None and result.activated_point is not None
    assert result.alert.actions["brigade_id"] is None


async def test_dismiss_requires_reason_and_blocks_confirmation(container):
    alert = await raise_cluster_alert(container)
    with pytest.raises(ValidationFailed):
        await container.decisions.dismiss(alert.id, "operator", "   ")
    dismissed = await container.decisions.dismiss(alert.id, "operator", "Təlim siqnalı")
    assert dismissed.status is AlertStatus.DISMISSED
    assert dismissed.dismiss_reason == "Təlim siqnalı"
    assert audit(container, "alert.dismissed")[0].details == {"reason": "Təlim siqnalı"}
    with pytest.raises(Conflict):
        await container.decisions.confirm(alert.id, "operator")
    assert all(b.target_alert_id != alert.id for b in container.brigades.list())


async def test_confirm_unknown_alert(container):
    with pytest.raises(NotFound):
        await container.decisions.confirm(9999, "operator")
