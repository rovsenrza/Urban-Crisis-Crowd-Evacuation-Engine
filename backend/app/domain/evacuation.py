"""Evacuation plan: ranking assembly points and choosing the recommended one."""
from __future__ import annotations

from dataclasses import dataclass, field

from .geo import GeoPoint, LatLng
from .models import AssemblyPoint, Thresholds


@dataclass
class EvacuationOption:
    point: AssemblyPoint
    distance_m: float
    eta_s: int
    geometry: list[LatLng]
    edge_ids: list[str]
    level: str  # green | yellow | red


@dataclass
class EvacuationPlan:
    origin: GeoPoint
    options: list[EvacuationOption] = field(default_factory=list)
    recommended_point_id: int | None = None
    selected_point_id: int | None = None
    reachable: bool = False
    all_full: bool = False
    # True when the plan was computed with the barrier-free profile.
    accessible: bool = False
    # "fallback" when the external routing API is down and local data answered.
    routing_mode: str = "live"
    fallback_source: str | None = None  # cache | local_graph | static_matrix

    def option(self, point_id: int | None) -> EvacuationOption | None:
        return next((o for o in self.options if o.point.id == point_id), None)

    @property
    def selected(self) -> EvacuationOption | None:
        return self.option(self.selected_point_id)


def occupancy_level(pct: float, thresholds: Thresholds) -> str:
    """green < 70, yellow 70–90, red > 90 (limits come from config)."""
    if pct < thresholds.occupancy_yellow_pct:
        return "green"
    if pct <= thresholds.occupancy_red_pct:
        return "yellow"
    return "red"


def is_eligible(option: EvacuationOption, thresholds: Thresholds) -> bool:
    """A point is a valid evacuation target while below the re-route limit."""
    return option.point.occupancy_pct < thresholds.reroute_occupancy_pct


def choose_recommended(
    options: list[EvacuationOption], thresholds: Thresholds
) -> tuple[int | None, bool]:
    """Pick the nearest eligible point from options sorted by route distance.

    Returns (point_id, all_full). When every reachable point is at or above the
    re-route limit we still return the nearest one: a crowded shelter is better
    than no destination at all.
    """
    if not options:
        return None, False
    for option in options:
        if is_eligible(option, thresholds):
            return option.point.id, False
    return options[0].point.id, True


def trim_options(
    options: list[EvacuationOption], limit: int, keep_ids: set[int]
) -> list[EvacuationOption]:
    """Keep the `limit` nearest options plus any that must stay visible."""
    kept = [o for i, o in enumerate(options) if i < limit or o.point.id in keep_ids]
    return kept
