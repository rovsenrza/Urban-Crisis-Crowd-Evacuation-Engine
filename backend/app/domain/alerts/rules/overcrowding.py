"""Rule B: overcrowding.

RED alert when an active assembly point's occupancy is strictly above the
critical limit (95 % → no alert, 95.1 % → alert). O(1) per event.
"""
from __future__ import annotations

from ...events import AssemblyOccupancyChanged, DomainEvent
from ..base import AlertCandidate, AlertRule, RuleContext
from ..registry import register_rule


@register_rule
class OvercrowdingRule(AlertRule):
    rule_id = "overcrowding"
    event_types = (AssemblyOccupancyChanged,)

    def evaluate(self, event: DomainEvent, context: RuleContext) -> list[AlertCandidate]:
        if not isinstance(event, AssemblyOccupancyChanged):
            return []
        point = event.point
        if not point.is_active:
            return []
        if point.occupancy_pct <= context.thresholds.critical_occupancy_pct:
            return []
        return [
            AlertCandidate(
                rule_id=self.rule_id,
                dedup_key=f"{self.rule_id}:{point.id}",
                lat=point.lat,
                lng=point.lng,
                zone_id=point.zone_id,
                payload={
                    "point_id": point.id,
                    "point_name": point.name,
                    "occupancy": point.occupancy,
                    "capacity": point.capacity,
                    "occupancy_pct": round(point.occupancy_pct, 1),
                },
            )
        ]
