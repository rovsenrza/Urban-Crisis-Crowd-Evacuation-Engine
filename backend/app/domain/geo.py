"""Pure geographic helpers (no external dependencies)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Iterable, Sequence, TypeVar

EARTH_RADIUS_M = 6_371_000.0

T = TypeVar("T")
LatLng = tuple[float, float]


@dataclass(frozen=True)
class GeoPoint:
    lat: float
    lng: float

    def as_tuple(self) -> LatLng:
        return (self.lat, self.lng)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def distance_m(a: GeoPoint, b: GeoPoint) -> float:
    return haversine_m(a.lat, a.lng, b.lat, b.lng)


def centroid(points: Iterable[GeoPoint]) -> GeoPoint:
    """Arithmetic mean; accurate enough at city scale."""
    pts = list(points)
    if not pts:
        raise ValueError("centroid of an empty set")
    return GeoPoint(sum(p.lat for p in pts) / len(pts), sum(p.lng for p in pts) / len(pts))


def nearest(items: Sequence[T], target: GeoPoint, position: Callable[[T], GeoPoint]) -> T:
    """Item whose position is closest (straight line) to `target`."""
    if not items:
        raise ValueError("nearest of an empty sequence")
    return min(items, key=lambda item: distance_m(position(item), target))


def advance_along(polyline: Sequence[LatLng], metres: float) -> tuple[LatLng, list[LatLng]]:
    """Move `metres` along a polyline.

    Returns the new position and the remaining polyline (starting at that
    position). When the end is reached the remaining polyline has one point.
    """
    if not polyline:
        raise ValueError("empty polyline")
    remaining = list(polyline)
    budget = max(0.0, metres)
    while len(remaining) > 1:
        (lat1, lng1), (lat2, lng2) = remaining[0], remaining[1]
        segment = haversine_m(lat1, lng1, lat2, lng2)
        if segment > budget:
            ratio = budget / segment if segment else 1.0
            position = (lat1 + (lat2 - lat1) * ratio, lng1 + (lng2 - lng1) * ratio)
            return position, [position, *remaining[1:]]
        budget -= segment
        remaining.pop(0)
    return remaining[0], remaining


def polyline_length_m(polyline: Sequence[LatLng]) -> float:
    return sum(
        haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(polyline, polyline[1:])
    )
