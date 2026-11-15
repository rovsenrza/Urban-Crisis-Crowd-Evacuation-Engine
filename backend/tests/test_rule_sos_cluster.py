"""Rule A (SOS cluster): pure domain tests with a fake context."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.domain.alerts import RED_ALERT_ACTION
from app.domain.alerts.rules.sos_cluster import SOSClusterRule
from app.domain.events import AssemblyOccupancyChanged, SOSCreated
from app.domain.geo import haversine_m
from app.domain.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    AssemblyKind,
    AssemblyPoint,
    SOSSignal,
    SOSStatus,
    Thresholds,
)

from .conftest import START

RULE = SOSClusterRule()
# Four spots ~70–140 m apart near the Nəsimi/Nərimanov border.
NEAR = [(40.4000, 49.8570), (40.4006, 49.8570), (40.4000, 49.8580), (40.4006, 49.8580)]
# Four spots more than 1 km apart.
FAR = [(40.380, 49.800), (40.395, 49.800), (40.380, 49.820), (40.395, 49.820)]


@dataclass
class FakeContext:
    now: datetime
    signals: list[SOSSignal]
    thresholds: Thresholds = field(default_factory=Thresholds)
    alerts: list[Alert] = field(default_factory=list)

    def open_sos_since(self, since: datetime) -> list[SOSSignal]:
        return [s for s in self.signals if s.created_at >= since]

    def active_alerts(self, rule_id: str) -> list[Alert]:
        return [a for a in self.alerts if a.rule_id == rule_id]


def sos(index: int, citizen: str, position: tuple[float, float], zone: str = "yasamal",
        minutes: float = 0, hazard: str = "fire") -> SOSSignal:
    return SOSSignal(id=index, citizen_id=citizen, lat=position[0], lng=position[1],
                     zone_id=zone, hazard_type=hazard, status=SOSStatus.OPEN,
                     created_at=START + timedelta(minutes=minutes))


def evaluate(signals: list[SOSSignal], alerts: list[Alert] | None = None):
    """Run the rule as if the last signal had just arrived."""
    newest = signals[-1]
    context = FakeContext(now=newest.created_at, signals=signals, alerts=alerts or [])
    return RULE.evaluate(SOSCreated(sos=newest, occurred_at=newest.created_at), context)


def test_three_distinct_sos_no_alert():
    signals = [sos(i, f"c{i}", NEAR[i]) for i in range(3)]
    assert evaluate(signals) == []


def test_four_distinct_sos_in_zone_raise_red_alert():
    signals = [sos(i, f"c{i}", FAR[i], hazard=h)
               for i, h in enumerate(["fire", "collapse", "fire", "medical"])]
    [alert] = evaluate(signals)
    assert alert.severity is AlertSeverity.RED
    assert alert.message == RED_ALERT_ACTION
    assert alert.zone_id == "yasamal"
    assert alert.dedup_key == "sos_cluster:zone:yasamal"
    assert alert.payload["scope"] == "zone"
    assert alert.payload["count"] == 4
    assert alert.payload["hazard_types"] == ["collapse", "fire", "medical"]
    # Centroid is the mean of the four positions.
    assert abs(alert.lat - sum(p[0] for p in FAR) / 4) < 1e-9
    assert abs(alert.lng - sum(p[1] for p in FAR) / 4) < 1e-9


def test_four_sos_from_same_citizen_no_alert():
    signals = [sos(i, "same-citizen", NEAR[i], minutes=i) for i in range(4)]
    assert evaluate(signals) == []


def test_distinct_citizens_are_counted_not_signals():
    # 5 signals but only 3 different citizens.
    citizens = ["a", "b", "c", "a", "b"]
    signals = [sos(i, c, NEAR[i % 4]) for i, c in enumerate(citizens)]
    assert evaluate(signals) == []


def test_four_sos_spread_over_six_minutes_no_alert():
    signals = [sos(i, f"c{i}", NEAR[i], minutes=2 * i) for i in range(4)]  # t = 0, 2, 4, 6
    assert evaluate(signals) == []


def test_window_is_sliding_not_fixed():
    # t = 0 falls out of the window, but 4 signals at t = 2..6 are inside it.
    signals = [sos(i, f"c{i}", NEAR[i % 4], minutes=m) for i, m in enumerate([0, 2, 3, 4, 6])]
    [alert] = evaluate(signals)
    assert alert.payload["count"] == 4
    assert 0 not in alert.payload["sos_ids"]


def test_signal_exactly_five_minutes_old_is_inside_window():
    signals = [sos(i, f"c{i}", NEAR[i], minutes=m) for i, m in enumerate([0, 1, 2, 5])]
    assert len(evaluate(signals)) == 1


def test_four_sos_within_500m_in_different_zones_raise_alert():
    zones = ["nesimi", "nerimanov", "nesimi", "nerimanov"]
    signals = [sos(i, f"c{i}", NEAR[i], zone=zones[i]) for i in range(4)]
    assert max(haversine_m(*a, *b) for a in NEAR for b in NEAR) < 500
    [alert] = evaluate(signals)
    assert alert.payload["scope"] == "radius"
    assert alert.payload["count"] == 4
    assert alert.payload["zone_ids"] == ["nerimanov", "nesimi"]
    assert alert.dedup_key.startswith("sos_cluster:radius:")


def test_four_sos_in_different_zones_and_far_apart_no_alert():
    zones = ["nesimi", "nerimanov", "yasamal", "sebail"]
    signals = [sos(i, f"c{i}", FAR[i], zone=zones[i]) for i in range(4)]
    assert evaluate(signals) == []


def test_radius_cluster_found_when_newest_signal_is_on_the_edge():
    # Line of points 300 m apart: ends are 900 m apart, so only a circle centred
    # on an inner point covers three others plus... the newest edge point.
    line = [(40.4000, 49.8500), (40.4027, 49.8500), (40.4054, 49.8500)]
    zones = ["a", "b", "c", "d"]
    signals = [sos(0, "c0", line[1], zone=zones[0]), sos(1, "c1", line[1], zone=zones[1]),
               sos(2, "c2", line[2], zone=zones[2]), sos(3, "c3", line[0], zone=zones[3])]
    [alert] = evaluate(signals)
    assert alert.payload["scope"] == "radius"


def test_radius_cluster_is_suppressed_by_active_alert_nearby():
    zones = ["nesimi", "nerimanov", "nesimi", "nerimanov"]
    signals = [sos(i, f"c{i}", NEAR[i], zone=zones[i]) for i in range(4)]
    existing = Alert(id=1, rule_id="sos_cluster", severity=AlertSeverity.RED,
                     status=AlertStatus.OPEN, dedup_key="sos_cluster:radius:x", message="",
                     lat=40.4003, lng=49.8575, zone_id="nesimi", payload={}, created_at=START)
    assert evaluate(signals, alerts=[existing]) == []


def test_rule_ignores_other_events():
    point = AssemblyPoint(1, "P", AssemblyKind.PARK, 40.4, 49.8, 100, 99, True, False, "nesimi")
    context = FakeContext(now=START, signals=[])
    assert RULE.evaluate(AssemblyOccupancyChanged(point=point, previous_pct=0), context) == []
