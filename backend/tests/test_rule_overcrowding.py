"""Rule B (overcrowding): pure domain tests + registry behaviour."""
from __future__ import annotations

from app.domain.alerts import AlertRule, RuleRegistry, load_builtin_rules
from app.domain.alerts.rules.overcrowding import OvercrowdingRule
from app.domain.events import AssemblyOccupancyChanged, SOSCreated
from app.domain.models import AlertSeverity, AssemblyKind, AssemblyPoint, Thresholds

from .conftest import START
from .test_rule_sos_cluster import FakeContext, sos

RULE = OvercrowdingRule()


def point(occupancy: int, capacity: int = 1000, active: bool = True) -> AssemblyPoint:
    return AssemblyPoint(7, "Test parkı", AssemblyKind.PARK, 40.40, 49.85, capacity, occupancy,
                         active, False, "nesimi")


def evaluate(p: AssemblyPoint, thresholds: Thresholds | None = None):
    context = FakeContext(now=START, signals=[], thresholds=thresholds or Thresholds())
    return RULE.evaluate(AssemblyOccupancyChanged(point=p, previous_pct=0), context)


def test_exactly_95_percent_no_alert():
    assert point(950).occupancy_pct == 95.0
    assert evaluate(point(950)) == []


def test_95_point_1_percent_raises_red_alert():
    [alert] = evaluate(point(951))
    assert alert.severity is AlertSeverity.RED
    assert alert.dedup_key == "overcrowding:7"
    assert alert.payload["occupancy_pct"] == 95.1
    assert alert.payload["point_name"] == "Test parkı"
    assert (alert.lat, alert.lng, alert.zone_id) == (40.40, 49.85, "nesimi")


def test_inactive_point_never_alerts():
    assert evaluate(point(1000, active=False)) == []


def test_threshold_comes_from_configuration():
    assert len(evaluate(point(850), Thresholds(critical_occupancy_pct=80))) == 1
    assert evaluate(point(970), Thresholds(critical_occupancy_pct=99)) == []


def test_rule_ignores_other_events():
    signal = sos(1, "c1", (40.4, 49.85))
    context = FakeContext(now=START, signals=[signal])
    assert RULE.evaluate(SOSCreated(sos=signal), context) == []


def test_builtin_rules_are_auto_registered():
    rule_ids = {r.rule_id for r in load_builtin_rules().rules()}
    assert {"sos_cluster", "overcrowding"} <= rule_ids


def test_new_rule_needs_only_a_class_and_registration():
    class AlwaysRule(AlertRule):
        rule_id = "always"
        event_types = (SOSCreated,)

        def evaluate(self, event, context):
            return []

    registry = RuleRegistry()
    registry.register(AlwaysRule())
    assert [r.rule_id for r in registry.rules()] == ["always"]
