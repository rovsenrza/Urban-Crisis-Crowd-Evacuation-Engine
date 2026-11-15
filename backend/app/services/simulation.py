"""Demo simulator: random SOS, occupancy steps, road closures, full reset."""
from __future__ import annotations

import math
import random
import uuid
from typing import Callable

from ..adapters.db.repositories import UowFactory
from ..domain.errors import ValidationFailed
from ..domain.events import SystemReset
from ..domain.geo import GeoPoint, distance_m
from ..domain.hazards import HazardRegistry
from ..domain.models import AssemblyPoint, RoadEdge, SOSSignal
from ..domain.ports import Clock, EventBus
from ..domain.roles import CitizenRole
from .infrastructure import AssemblyService, RoadService
from .sos import SOSService

METRES_PER_DEGREE = 111_320.0


def offset(point: GeoPoint, north_m: float, east_m: float) -> GeoPoint:
    """Shift a point by metres (flat-earth approximation, fine at city scale)."""
    d_lat = north_m / METRES_PER_DEGREE
    d_lng = east_m / (METRES_PER_DEGREE * math.cos(math.radians(point.lat)))
    return GeoPoint(point.lat + d_lat, point.lng + d_lng)


class SimulationService:
    def __init__(self, uow: UowFactory, bus: EventBus, clock: Clock, hazards: HazardRegistry,
                 sos: SOSService, assembly: AssemblyService, roads: RoadService,
                 reset_database: Callable[[], None], rng: random.Random | None = None) -> None:
        self._uow, self._bus, self._clock, self._hazards = uow, bus, clock, hazards
        self._sos, self._assembly, self._roads = sos, assembly, roads
        self._reset_database = reset_database
        self._rng = rng or random.Random()

    # -- SOS -----------------------------------------------------------------

    async def random_sos(self, zone_id: str, count: int, hazard_type: str | None = None,
                         spread_m: float = 300.0,
                         role: CitizenRole | None = None) -> list[SOSSignal]:
        """`count` SOS signals from new anonymous citizens around a zone centre."""
        with self._uow() as uow:
            centre = uow.zones.get(zone_id).position
        return [await self._sos_near(centre, spread_m, hazard_type, role) for _ in range(count)]

    async def cross_zone_cluster(self, zone_a: str, zone_b: str, count: int = 4,
                                 hazard_type: str | None = None) -> list[SOSSignal]:
        """SOS signals straddling the border of two zones, all within ~150 m of
        each other: demonstrates the radius branch of Rule A."""
        with self._uow() as uow:
            a, b = uow.zones.get(zone_a).position, uow.zones.get(zone_b).position
        middle = GeoPoint((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)
        length = distance_m(a, b) or 1.0
        north = (b.lat - a.lat) * METRES_PER_DEGREE / length
        east = (b.lng - a.lng) * METRES_PER_DEGREE * math.cos(math.radians(middle.lat)) / length
        signals = []
        for index in range(count):
            side = 1 if index % 2 else -1  # alternate sides of the border
            centre = offset(middle, side * 110 * north, side * 110 * east)
            signals.append(await self._sos_near(centre, 30.0, hazard_type))
        return signals

    async def _sos_near(self, centre: GeoPoint, spread_m: float, hazard_type: str | None,
                        role: CitizenRole | None = None) -> SOSSignal:
        angle = self._rng.uniform(0, 2 * math.pi)
        radius = spread_m * math.sqrt(self._rng.random())  # uniform over the disc
        position = offset(centre, radius * math.cos(angle), radius * math.sin(angle))
        hazard = hazard_type or self._rng.choice(self._hazards.codes())
        sos, _ = await self._sos.create(str(uuid.uuid4()), position.lat, position.lng, hazard,
                                        role)
        return sos

    # -- assembly points -------------------------------------------------------

    async def step_occupancy(self, point_id: int, delta_pct: float | None = None,
                             occupancy_pct: float | None = None) -> AssemblyPoint:
        return await self._assembly.set_occupancy(point_id, occupancy_pct=occupancy_pct,
                                                  delta_pct=delta_pct)

    def pick_demo_point(self, near_zone_id: str) -> AssemblyPoint:
        """Point most citizens are heading to, else the active one nearest a zone."""
        with self._uow() as uow:
            tracked = sorted(uow.citizens.tracked(), key=lambda c: c.updated_at or self._clock.now())
            points = [p for p in uow.points.list(active_only=True)]
            centre = uow.zones.get(near_zone_id).position
        targets = [c.target_point_id for c in tracked]
        if targets:
            # Most popular target; ties go to the most recently updated route.
            favourite = max(reversed(targets), key=targets.count)
            match = next((p for p in points if p.id == favourite), None)
            if match:
                return match
        return min(points, key=lambda p: distance_m(p.position, centre))

    # -- roads ---------------------------------------------------------------

    async def random_roads(self, action: str, count: int) -> list[RoadEdge]:
        """Close (or open) `count` random roads that are currently open (closed)."""
        if action not in ("close", "open"):
            raise ValidationFailed("action 'close' və ya 'open' olmalıdır", "invalid_action")
        want_open = action == "open"
        with self._uow() as uow:
            pool = [e for e in uow.roads.edges() if e.is_open != want_open]
        chosen = self._rng.sample(pool, min(count, len(pool)))
        return [await self._roads.set_open(edge.id, want_open) for edge in chosen]

    async def close_demo_roads(self, count: int) -> list[RoadEdge]:
        """Close one road on an active citizen route (so re-routing is visible
        in the demo) and fill up with random roads."""
        closed: list[RoadEdge] = []
        with self._uow() as uow:
            tracked = sorted(uow.citizens.tracked(), key=lambda c: c.updated_at or self._clock.now())
        routes = [c.edge_ids for c in tracked if c.edge_ids]
        if routes:
            latest = routes[-1]
            closed.append(await self._roads.set_open(latest[len(latest) // 2], False))
        closed += await self.random_roads("close", max(0, count - len(closed)))
        return closed

    async def open_all_roads(self) -> list[RoadEdge]:
        with self._uow() as uow:
            closed = [e for e in uow.roads.edges() if not e.is_open]
        return [await self._roads.set_open(edge.id, True) for edge in closed]

    # -- reset ---------------------------------------------------------------

    async def reset(self) -> None:
        """Drop everything and re-seed the demo city."""
        self._reset_database()
        await self._bus.publish(SystemReset(occurred_at=self._clock.now()))
