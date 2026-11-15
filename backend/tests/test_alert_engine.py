"""Alert engine end to end (services + real DB): dedup, cooldown, SOS intake."""
from __future__ import annotations

import pytest

from app.domain.errors import ValidationFailed
from app.domain.events import AlertRaised, CitizenMarkedSafe, SOSCreated
from app.domain.models import AlertStatus, SOSStatus

from .conftest import new_citizen, open_sos, raise_cluster_alert

YASAMAL = (40.3830, 49.8100)


async def send(container, count: int, citizen: str | None = None, gap_s: float = 0,
               position: tuple[float, float] = YASAMAL) -> None:
    for _ in range(count):
        await container.sos.create(citizen or new_citizen(), *position, "fire")
        container.clock.advance(seconds=gap_s)


async def test_three_sos_no_alert_fourth_raises(container, events):
    await send(container, 3)
    assert container.decisions.list() == []
    await send(container, 1)
    [alert] = container.decisions.list()
    assert alert.status is AlertStatus.OPEN
    assert alert.zone_id == "yasamal"
    assert alert.payload["count"] == 4
    assert len(events.of(AlertRaised)) == 1


async def test_no_duplicate_alert_while_one_is_open(container, events):
    await send(container, 8)
    assert len(container.decisions.list()) == 1
    assert len(events.of(AlertRaised)) == 1


async def test_cooldown_blocks_then_allows_new_alert(container, clock):
    alert = await raise_cluster_alert(container)
    await container.decisions.confirm(alert.id, "operator")

    clock.advance(minutes=9)  # inside ALERT_COOLDOWN_MIN = 10
    await send(container, 4)
    assert len(container.decisions.list()) == 1

    clock.advance(minutes=2)  # cooldown over; signals above are still in the window
    await send(container, 1)
    assert len(container.decisions.list()) == 2


async def test_dismissed_alert_also_respects_cooldown(container, clock):
    alert = await raise_cluster_alert(container)
    await container.decisions.dismiss(alert.id, "operator", "Yanlış həyəcan")
    await send(container, 4)
    assert len(container.decisions.list()) == 1


async def test_same_citizen_four_times_no_alert(container):
    citizen = new_citizen()
    await send(container, 4, citizen=citizen, gap_s=61)  # 61 s apart: 4 separate records
    assert len(open_sos(container)) == 4
    assert container.decisions.list() == []


async def test_four_sos_over_six_minutes_no_alert(container):
    await send(container, 4, gap_s=120)  # t = 0, 2, 4, 6 min
    assert container.decisions.list() == []


async def test_resolved_sos_do_not_count_towards_cluster(container):
    citizen = new_citizen()
    await send(container, 1, citizen=citizen)
    await send(container, 2)
    await container.sos.mark_safe(citizen)
    await send(container, 1)
    assert container.decisions.list() == []


async def test_duplicate_tap_within_60s_creates_one_record(container, clock, events):
    citizen = new_citizen()
    first, duplicate = await container.sos.create(citizen, *YASAMAL, "fire")
    assert duplicate is False
    clock.advance(seconds=59)
    second, duplicate = await container.sos.create(citizen, *YASAMAL, "flood")
    assert duplicate is True and second.id == first.id
    assert len(open_sos(container)) == 1
    assert len(events.of(SOSCreated)) == 1

    clock.advance(seconds=2)  # 61 s after the first tap
    third, duplicate = await container.sos.create(citizen, *YASAMAL, "fire")
    assert duplicate is False and third.id != first.id


async def test_sos_stores_zone_hazard_and_timestamp(container, clock):
    sos, _ = await container.sos.create(new_citizen(), 40.4079, 49.8702, "medical")
    assert (sos.zone_id, sos.hazard_type, sos.created_at) == ("nerimanov", "medical", clock.now())


async def test_unknown_hazard_is_rejected(container):
    with pytest.raises(ValidationFailed):
        await container.sos.create(new_citizen(), *YASAMAL, "meteor")


async def test_mark_safe_closes_open_sos(container, events):
    citizen = new_citizen()
    sos, _ = await container.sos.create(citizen, *YASAMAL, "fire")
    resolved = await container.sos.mark_safe(citizen)
    assert [s.id for s in resolved] == [sos.id]
    assert open_sos(container) == []
    assert container.sos.list(SOSStatus.RESOLVED)[0].resolved_at is not None
    assert events.of(CitizenMarkedSafe)[0].resolved_sos_ids == [sos.id]
    assert container.evacuation.citizen_state(citizen).is_safe is True


async def test_overcrowding_alert_and_dedup(container):
    point = container.assembly.list(active_only=True)[0]
    await container.assembly.set_occupancy(point.id, occupancy_pct=95)
    assert container.decisions.list() == []
    await container.assembly.set_occupancy(point.id, occupancy=point.capacity * 951 // 1000 + 1)
    [alert] = container.decisions.list()
    assert alert.rule_id == "overcrowding" and alert.payload["point_id"] == point.id
    await container.assembly.set_occupancy(point.id, occupancy_pct=99)
    assert len(container.decisions.list()) == 1
