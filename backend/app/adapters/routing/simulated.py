"""Default routing: Dijkstra on the stored road network (networkx).

The network is the real street graph of the city (see
`scripts/build_road_graph.py`); every edge carries the polyline of the street
segment, so routes follow the actual streets.

A position is attached to the nearest point of a nearby usable street (not to
a junction): the route starts by walking straight to that point, then runs
along street geometry, and ends the same way at the destination. Several
nearby streets are offered to the search, which picks the cheapest one, so a
closed street next to the citizen cannot trap them in a dead-end pocket.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from itertools import pairwise
from typing import Any, Iterator, Sequence

import networkx as nx

from ...domain.geo import GeoPoint, LatLng, distance_m, haversine_m
from ...domain.models import RoadGraph, Route

# A place further than this from every usable street is treated as unreachable
# (rather than inventing a long straight line across the city).
MAX_ACCESS_M = 750.0
METRES_PER_DEGREE = 111_320.0
CELL_DEG = 0.004  # spatial index cell: ~445 m north-south, ~340 m east-west
CELL_MIN_M = 330.0
EPSILON_M = 0.5
MAX_CANDIDATES = 6  # nearby streets tried as the way onto / off the network
# Walking off the network (a straight line across blocks) counts this many
# times its length when streets are compared, so the search only leaves the
# nearest street when that is clearly better. Reported distances stay real.
ACCESS_PENALTY = 3.0
ORIGIN = "__origin__"


@dataclass(frozen=True)
class _Edge:
    id: str
    source: str
    target: str
    length_m: float
    geometry: tuple[LatLng, ...]
    # Distance from `source` to each vertex, scaled so the last equals length_m.
    offsets: tuple[float, ...]

    def point_at(self, along_m: float) -> LatLng:
        return self.slice(along_m, along_m)[0]

    def slice(self, start_m: float, end_m: float) -> list[LatLng]:
        """Polyline along the edge between two offsets (reversed if start > end)."""
        low, high = min(start_m, end_m), max(start_m, end_m)
        points = [self._interpolate(low)]
        points += [p for p, offset in zip(self.geometry, self.offsets) if low < offset < high]
        points.append(self._interpolate(high))
        return points if start_m <= end_m else points[::-1]

    def _interpolate(self, along_m: float) -> LatLng:
        along_m = max(0.0, min(self.length_m, along_m))
        for (a, b), (start, end) in zip(pairwise(self.geometry), pairwise(self.offsets)):
            if along_m <= end:
                ratio = (along_m - start) / (end - start) if end > start else 0.0
                return (a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio)
        return self.geometry[-1]


@dataclass(frozen=True)
class _Snap:
    """A position projected onto a street."""

    edge: _Edge
    along_m: float  # offset from the edge's source
    access_m: float  # straight-line walk from the position to the street
    point: LatLng


def _cell(lat: float, lng: float) -> tuple[int, int]:
    return (math.floor(lat / CELL_DEG), math.floor(lng / CELL_DEG))


class SimulatedRoutingProvider:
    name = "simulated"

    def __init__(self, graph: RoadGraph) -> None:
        positions = {n.id: (n.lat, n.lng) for n in graph.nodes}
        self._edges: dict[str, _Edge] = {}
        self._graph: nx.Graph = nx.Graph()
        self._graph.add_nodes_from(positions)
        # Street segments bucketed by grid cell, for fast nearest-street lookup.
        self._index: dict[tuple[int, int], list[tuple[_Edge, int]]] = {}
        for raw in graph.edges:
            if raw.source == raw.target:
                continue
            geometry = tuple(raw.geometry) or (positions[raw.source], positions[raw.target])
            edge = _Edge(raw.id, raw.source, raw.target, raw.length_m, geometry,
                         self._offsets(geometry, raw.length_m))
            self._edges[edge.id] = edge
            known = self._graph.get_edge_data(edge.source, edge.target)
            if known is None or known["length"] > edge.length_m:
                self._graph.add_edge(edge.source, edge.target, id=edge.id, length=edge.length_m)
            for index, (a, b) in enumerate(pairwise(geometry)):
                for cell in self._cells_between(a, b):
                    self._index.setdefault(cell, []).append((edge, index))

    # -- public API ----------------------------------------------------------

    def routes_to_many(
        self,
        origin: GeoPoint,
        destinations: Sequence[GeoPoint],
        closed_edge_ids: frozenset[str] = frozenset(),
    ) -> list[Route | None]:
        """One Dijkstra run from the origin serves every destination.

        `closed_edge_ids` are streets that must not be used at all (closed, or
        not barrier-free for the accessible profile).
        """
        starts = self._snaps(origin, closed_edge_ids)
        if not starts:
            return [None for _ in destinations]

        def weight(_u: str, _v: str, data: dict[str, Any]) -> float | None:
            # Returning None hides the edge from the search.
            return None if data["id"] in closed_edge_ids else data["length"]

        # Temporary origin node linked to both ends of every nearby street.
        # The link cost includes the walk to the street, so the search itself
        # picks the best street to join (and skips dead-end pockets).
        entries: dict[str, tuple[float, _Snap, float]] = {}
        for snap in starts:
            edge = snap.edge
            for node, exit_m in ((edge.source, 0.0), (edge.target, edge.length_m)):
                cost = ACCESS_PENALTY * snap.access_m + abs(exit_m - snap.along_m)
                if node not in entries or cost < entries[node][0]:
                    entries[node] = (cost, snap, exit_m)
        for node, (cost, _, _) in entries.items():
            self._graph.add_edge(ORIGIN, node, id=ORIGIN, length=cost)
        try:
            distances, paths = nx.single_source_dijkstra(self._graph, ORIGIN, weight=weight)
        finally:
            self._graph.remove_node(ORIGIN)

        return [
            self._best_route(origin, destination, starts, entries, distances, paths,
                             self._snaps(destination, closed_edge_ids))
            for destination in destinations
        ]

    def route(
        self,
        origin: GeoPoint,
        destination: GeoPoint,
        closed_edge_ids: frozenset[str] = frozenset(),
    ) -> Route | None:
        return self.routes_to_many(origin, [destination], closed_edge_ids)[0]

    # -- route assembly ------------------------------------------------------

    def _best_route(self, origin: GeoPoint, destination: GeoPoint, starts: list[_Snap],
                    entries: dict[str, tuple[float, _Snap, float]], distances: dict[str, float],
                    paths: dict[str, list[str]], ends: list[_Snap]) -> Route | None:
        """Cheapest way to reach the destination over any of its nearby streets."""
        # (penalised cost, destination snap, node the street is entered at | origin snap)
        best: tuple[float, _Snap, str | _Snap] | None = None
        for end in ends:
            last = end.edge
            options: list[tuple[float, str | _Snap]] = [
                (distances[node] + abs(end.along_m - entry_m), node)
                for node, entry_m in ((last.source, 0.0), (last.target, last.length_m))
                if node in distances
            ]
            # Origin and destination on one street: walk straight along it.
            options += [(ACCESS_PENALTY * start.access_m + abs(end.along_m - start.along_m), start)
                        for start in starts if start.edge.id == last.id]
            for cost, via in options:
                cost += ACCESS_PENALTY * end.access_m
                if best is None or cost < best[0]:
                    best = (cost, end, via)
        if best is None:
            return None
        cost, end, via = best
        last = end.edge

        if isinstance(via, _Snap):
            start = via
            line = last.slice(start.along_m, end.along_m)
            edge_ids = [last.id]
        else:
            nodes = paths[via][1:]  # drop the temporary origin node
            _, start, exit_m = entries[nodes[0]]
            entry_m = 0.0 if via == last.source else last.length_m
            line = start.edge.slice(start.along_m, exit_m)
            edge_ids = [start.edge.id] if abs(exit_m - start.along_m) > EPSILON_M else []
            for u, v in pairwise(nodes):
                street = self._edges[self._graph[u][v]["id"]]
                line += street.geometry if street.source == u else street.geometry[::-1]
                edge_ids.append(street.id)
            line += last.slice(entry_m, end.along_m)
            if abs(end.along_m - entry_m) > EPSILON_M:
                edge_ids.append(last.id)

        # Remove the penalty again: the route's distance is the real one.
        total = cost - (ACCESS_PENALTY - 1) * (start.access_m + end.access_m)
        geometry = [origin.as_tuple(), *line, destination.as_tuple()]
        return Route(round(total, 1), _without_repeats(geometry), _without_repeats(edge_ids))

    # -- nearest streets -----------------------------------------------------

    def _snaps(self, point: GeoPoint, blocked: frozenset[str]) -> list[_Snap]:
        """Projections of a position onto the nearest usable streets (closest
        first, at most MAX_CANDIDATES, none further than MAX_ACCESS_M)."""
        centre = _cell(point.lat, point.lng)
        scale = math.cos(math.radians(point.lat))
        nearest: dict[str, tuple[float, _Edge, int, float]] = {}
        for radius in range(math.ceil(MAX_ACCESS_M / CELL_MIN_M) + 2):
            for cell in _ring(centre, radius):
                for edge, index in self._index.get(cell, ()):
                    if edge.id in blocked:
                        continue
                    distance, ratio = _project(point, edge.geometry[index], edge.geometry[index + 1], scale)
                    if distance <= MAX_ACCESS_M and (edge.id not in nearest or distance < nearest[edge.id][0]):
                        nearest[edge.id] = (distance, edge, index, ratio)
            # Streets in later rings are at least `radius` cells away: stop once
            # enough closer candidates are known.
            closer = sum(1 for found in nearest.values() if found[0] <= radius * CELL_MIN_M)
            if closer >= MAX_CANDIDATES:
                break
        snaps = []
        for _, edge, index, ratio in sorted(nearest.values(), key=lambda found: found[0])[:MAX_CANDIDATES]:
            along = edge.offsets[index] + (edge.offsets[index + 1] - edge.offsets[index]) * ratio
            snapped = edge.point_at(along)
            snaps.append(_Snap(edge, along, distance_m(point, GeoPoint(*snapped)), snapped))
        return snaps

    @staticmethod
    def _offsets(geometry: Sequence[LatLng], length_m: float) -> tuple[float, ...]:
        steps = [haversine_m(a[0], a[1], b[0], b[1]) for a, b in pairwise(geometry)]
        total = sum(steps) or 1.0
        offsets, travelled = [0.0], 0.0
        for step in steps:
            travelled += step
            offsets.append(travelled / total * length_m)
        offsets[-1] = length_m
        return tuple(offsets)

    @staticmethod
    def _cells_between(a: LatLng, b: LatLng) -> Iterator[tuple[int, int]]:
        (row1, col1), (row2, col2) = _cell(*a), _cell(*b)
        for row in range(min(row1, row2), max(row1, row2) + 1):
            for col in range(min(col1, col2), max(col1, col2) + 1):
                yield (row, col)


def _ring(centre: tuple[int, int], radius: int) -> Iterator[tuple[int, int]]:
    """Cells at Chebyshev distance `radius` from the centre cell."""
    row, col = centre
    if radius == 0:
        yield centre
        return
    for offset in range(-radius, radius + 1):
        yield (row - radius, col + offset)
        yield (row + radius, col + offset)
    for offset in range(-radius + 1, radius):
        yield (row + offset, col - radius)
        yield (row + offset, col + radius)


def _project(point: GeoPoint, a: LatLng, b: LatLng, scale: float) -> tuple[float, float]:
    """Distance in metres from `point` to segment a–b and the position (0..1)
    of the closest point along it. Flat-earth maths: exact enough at street scale."""
    ax, ay = (a[1] - point.lng) * scale * METRES_PER_DEGREE, (a[0] - point.lat) * METRES_PER_DEGREE
    bx, by = (b[1] - point.lng) * scale * METRES_PER_DEGREE, (b[0] - point.lat) * METRES_PER_DEGREE
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    ratio = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_sq))
    return math.hypot(ax + dx * ratio, ay + dy * ratio), ratio


def _without_repeats(items: list[Any]) -> list[Any]:
    """Drop consecutive duplicates (joins between street pieces repeat a point)."""
    result: list[Any] = []
    for item in items:
        if not result or result[-1] != item:
            result.append(item)
    return result
