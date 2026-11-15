"""Roads, assembly points and brigades: state changes that publish events."""
from __future__ import annotations

from ..adapters.db.repositories import UowFactory
from ..config import Settings
from ..domain.errors import ValidationFailed
from ..domain.events import AssemblyOccupancyChanged, BrigadeStatusChanged, RoadStatusChanged
from ..domain.geo import advance_along, polyline_length_m
from ..domain.models import AssemblyPoint, Brigade, BrigadeStatus, RoadEdge, RoadGraph
from ..domain.ports import Clock, EventBus


class RoadService:
    def __init__(self, uow: UowFactory, bus: EventBus, clock: Clock) -> None:
        self._uow, self._bus, self._clock = uow, bus, clock

    def graph(self) -> RoadGraph:
        with self._uow() as uow:
            return RoadGraph(uow.roads.nodes(), uow.roads.edges())

    async def set_open(self, edge_id: str, is_open: bool) -> RoadEdge:
        with self._uow() as uow:
            before = uow.roads.get_edge(edge_id)
            if before.is_open == is_open:
                return before  # no state change, no event
            edge = uow.roads.set_open(edge_id, is_open)
            uow.commit()
        await self._bus.publish(RoadStatusChanged(edge=edge, occurred_at=self._clock.now()))
        return edge


class AssemblyService:
    def __init__(self, uow: UowFactory, bus: EventBus, clock: Clock) -> None:
        self._uow, self._bus, self._clock = uow, bus, clock

    def list(self, active_only: bool = False) -> list[AssemblyPoint]:
        with self._uow() as uow:
            return uow.points.list(active_only)

    async def set_occupancy(self, point_id: int, occupancy: int | None = None,
                            occupancy_pct: float | None = None,
                            delta_pct: float | None = None) -> AssemblyPoint:
        """Set occupancy by absolute count, by percent, or by percent step."""
        with self._uow() as uow:
            before = uow.points.get(point_id)
            if occupancy is not None:
                value = occupancy
            elif occupancy_pct is not None:
                value = round(before.capacity * occupancy_pct / 100)
            elif delta_pct is not None:
                value = before.occupancy + round(before.capacity * delta_pct / 100)
            else:
                raise ValidationFailed("occupancy, occupancy_pct və ya delta_pct göstərilməlidir",
                                       "occupancy_required")
            value = max(0, min(before.capacity, value))
            point = uow.points.update(point_id, occupancy=value)
            uow.commit()
        await self._bus.publish(
            AssemblyOccupancyChanged(point=point, previous_pct=before.occupancy_pct,
                                     occurred_at=self._clock.now())
        )
        return point


class BrigadeService:
    def __init__(self, uow: UowFactory, bus: EventBus, clock: Clock, settings: Settings) -> None:
        self._uow, self._bus, self._clock, self._settings = uow, bus, clock, settings

    def list(self) -> list[Brigade]:
        with self._uow() as uow:
            return uow.brigades.list()

    async def set_status(self, brigade_id: int, status: BrigadeStatus) -> Brigade:
        with self._uow() as uow:
            fields: dict[str, object] = {"status": status}
            if status is not BrigadeStatus.EN_ROUTE:
                fields.update(route=[], eta_s=None)
            if status is BrigadeStatus.AVAILABLE:
                fields.update(target_lat=None, target_lng=None, target_alert_id=None)
            brigade = uow.brigades.update(brigade_id, **fields)
            uow.commit()
        await self._bus.publish(BrigadeStatusChanged(brigade=brigade, occurred_at=self._clock.now()))
        return brigade

    async def tick(self, elapsed_s: float) -> list[Brigade]:
        """Advance en-route brigades along their route (demo movement)."""
        step_m = self._settings.brigade_speed_mps * elapsed_s * self._settings.brigade_sim_speedup
        moved: list[Brigade] = []
        with self._uow() as uow:
            for brigade in uow.brigades.list():
                if brigade.status is not BrigadeStatus.EN_ROUTE or not brigade.route:
                    continue
                (lat, lng), remaining = advance_along(brigade.route, step_m)
                arrived = len(remaining) <= 1
                left_m = polyline_length_m(remaining)
                moved.append(
                    uow.brigades.update(
                        brigade.id, lat=lat, lng=lng,
                        route=[] if arrived else remaining,
                        status=BrigadeStatus.ON_SITE if arrived else BrigadeStatus.EN_ROUTE,
                        eta_s=None if arrived else round(left_m / self._settings.brigade_speed_mps),
                    )
                )
            uow.commit()
        for brigade in moved:
            await self._bus.publish(
                BrigadeStatusChanged(brigade=brigade, occurred_at=self._clock.now())
            )
        return moved
