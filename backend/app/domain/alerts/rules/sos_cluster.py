"""Rule A: SOS cluster.

RED alert when at least N SOS signals from *distinct* citizens arrive inside a
sliding time window either (a) in the same zone or (b) within a radius.

The rule is evaluated incrementally on every new SOS (the "anchor"), so the
sliding window always ends at the newest signal.

Complexity per event, with n = open SOS inside the window:
  * zone check   O(n)
  * radius check O(k·n), k = signals within the radius of the anchor (k ≤ n).
    Every such neighbour is tried as a circle centre, which catches clusters
    where the anchor sits on the edge rather than in the middle.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Sequence

from ...events import DomainEvent, SOSCreated
from ...geo import GeoPoint, centroid, distance_m
from ...models import SOSSignal
from ..base import AlertCandidate, AlertRule, RuleContext
from ..registry import register_rule


def distinct_citizens(signals: Sequence[SOSSignal]) -> int:
    return len({s.citizen_id for s in signals})


@register_rule
class SOSClusterRule(AlertRule):
    rule_id = "sos_cluster"
    event_types = (SOSCreated,)

    def evaluate(self, event: DomainEvent, context: RuleContext) -> list[AlertCandidate]:
        if not isinstance(event, SOSCreated):
            return []
        limits = context.thresholds
        anchor = event.sos
        window_start = context.now - timedelta(minutes=limits.sos_cluster_window_min)
        recent = [s for s in context.open_sos_since(window_start) if s.id != anchor.id]
        recent.append(anchor)

        zone_group = [s for s in recent if s.zone_id == anchor.zone_id]
        if distinct_citizens(zone_group) >= limits.sos_cluster_min_count:
            key = f"{self.rule_id}:zone:{anchor.zone_id}"
            return [self._candidate(zone_group, "zone", key, anchor.zone_id)]

        radius_group = self._largest_radius_group(anchor, recent, limits.sos_cluster_radius_m)
        if distinct_citizens(radius_group) < limits.sos_cluster_min_count:
            return []
        centre = centroid(s.position for s in radius_group)
        # A radius cluster has no natural identity, so dedup spatially: skip it
        # when an active cluster alert already covers this location.
        for alert in context.active_alerts(self.rule_id):
            if distance_m(alert.position, centre) <= limits.sos_cluster_radius_m:
                return []
        key = f"{self.rule_id}:radius:{centre.lat:.3f}:{centre.lng:.3f}"
        return [self._candidate(radius_group, "radius", key, anchor.zone_id)]

    @staticmethod
    def _largest_radius_group(
        anchor: SOSSignal, signals: Sequence[SOSSignal], radius_m: float
    ) -> list[SOSSignal]:
        """Best circle (by distinct citizens) centred on a signal near the anchor."""
        centres = [s for s in signals if distance_m(s.position, anchor.position) <= radius_m]
        best: list[SOSSignal] = []
        for centre in centres:
            group = [s for s in signals if distance_m(s.position, centre.position) <= radius_m]
            if distinct_citizens(group) > distinct_citizens(best):
                best = group
        return best

    def _candidate(
        self, group: Sequence[SOSSignal], scope: str, key: str, zone_id: str
    ) -> AlertCandidate:
        centre: GeoPoint = centroid(s.position for s in group)
        return AlertCandidate(
            rule_id=self.rule_id,
            dedup_key=key,
            lat=centre.lat,
            lng=centre.lng,
            zone_id=zone_id,
            payload={
                "scope": scope,
                "count": distinct_citizens(group),
                "signal_count": len(group),
                "hazard_types": sorted({s.hazard_type for s in group}),
                "zone_ids": sorted({s.zone_id for s in group}),
                "sos_ids": sorted(s.id for s in group),
            },
        )
