"""Automatic re-routing of tracked citizens (bus subscriber).

Triggers: a road on the citizen's route closes, the target assembly point
reaches the re-route occupancy limit, or an operator confirms an alert that
affects the citizen. The result is published as `CitizenRerouted`; the
realtime layer pushes it to that citizen's WebSocket.
"""
from __future__ import annotations

from typing import Any

from ..adapters.db.repositories import UowFactory
from ..config import Settings
from ..domain.events import (
    AlertConfirmed,
    AssemblyOccupancyChanged,
    CitizenRerouted,
    DomainEvent,
    RoadStatusChanged,
)
from ..domain.geo import distance_m
from ..domain.models import Alert, CitizenState
from ..domain.ports import Clock, EventBus
from .evacuation import EvacuationService

SYSTEM_ACTOR = "system"


class RerouteService:
    def __init__(self, uow: UowFactory, bus: EventBus, evacuation: EvacuationService,
                 settings: Settings, clock: Clock) -> None:
        self._uow, self._bus, self._evacuation = uow, bus, evacuation
        self._settings, self._clock = settings, clock

    def attach(self, bus: EventBus) -> None:
        bus.subscribe(RoadStatusChanged, self._on_road_changed)
        bus.subscribe(AssemblyOccupancyChanged, self._on_occupancy_changed)
        bus.subscribe(AlertConfirmed, self._on_alert_confirmed)

    async def _on_road_changed(self, event: DomainEvent) -> None:
        assert isinstance(event, RoadStatusChanged)
        if event.edge.is_open:
            return
        affected = [c for c in self._tracked() if event.edge.id in c.edge_ids]
        detail = {"edge_id": event.edge.id, "edge_name": event.edge.name}
        for citizen in affected:
            # A destination the citizen chose themselves is kept (new path only);
            # otherwise the detour may make another point the nearest one.
            await self._replan(citizen, "road_closed", detail, keep_target=citizen.manual_target)

    async def _on_occupancy_changed(self, event: DomainEvent) -> None:
        assert isinstance(event, AssemblyOccupancyChanged)
        point = event.point
        if point.occupancy_pct < self._settings.reroute_occupancy_pct:
            return
        affected = [c for c in self._tracked() if c.target_point_id == point.id]
        detail = {"point_id": point.id, "point_name": point.name,
                  "occupancy_pct": round(point.occupancy_pct, 1)}
        for citizen in affected:
            await self._replan(citizen, "point_full", detail, keep_target=False)

    async def _on_alert_confirmed(self, event: DomainEvent) -> None:
        assert isinstance(event, AlertConfirmed)
        alert, opened = event.alert, event.activated_point
        affected = [c for c in self._tracked() if self._is_affected(c, alert)]
        detail = {"alert_id": alert.id, "rule_id": alert.rule_id,
                  "activated_point_id": opened.id if opened else None,
                  "activated_point_name": opened.name if opened else None}
        rerouted = 0
        for citizen in affected:
            rerouted += await self._replan(citizen, "alert_confirmed", detail, keep_target=False,
                                           notify_unchanged=True)
        with self._uow() as uow:
            uow.audit.add(SYSTEM_ACTOR, "citizens.rerouted", alert.id,
                          {"notified": len(affected), "route_changed": rerouted},
                          self._clock.now())
            uow.commit()

    def _is_affected(self, citizen: CitizenState, alert: Alert) -> bool:
        """Heading to the alert's assembly point, or located in the crisis area."""
        if citizen.target_point_id is not None and citizen.target_point_id == alert.payload.get("point_id"):
            return True
        position = citizen.position
        if position is None:
            return False
        if distance_m(position, alert.position) <= self._settings.sos_cluster_radius_m:
            return True
        with self._uow() as uow:
            zones = uow.zones.list()
        zone = min(zones, key=lambda z: distance_m(z.position, position))
        return alert.rule_id == "sos_cluster" and zone.id in alert.payload.get("zone_ids", [])

    def _tracked(self) -> list[CitizenState]:
        with self._uow() as uow:
            return uow.citizens.tracked()

    async def _replan(self, citizen: CitizenState, reason: str, detail: dict[str, Any],
                      keep_target: bool, notify_unchanged: bool = False) -> int:
        """Recompute one citizen's plan. Returns 1 if the route changed."""
        plan = self._evacuation.track(
            citizen.citizen_id, lat=citizen.lat, lng=citizen.lng,
            prefer_point_id=citizen.target_point_id if keep_target else None,
        )
        option = plan.selected
        changed = (
            plan.selected_point_id != citizen.target_point_id
            or (option.edge_ids if option else []) != citizen.edge_ids
        )
        if not changed and not notify_unchanged:
            return 0  # nothing better exists; do not bother the citizen
        await self._bus.publish(
            CitizenRerouted(citizen_id=citizen.citizen_id, reason=reason, changed=changed,
                            detail=detail, plan=plan, previous_point_id=citizen.target_point_id,
                            occurred_at=self._clock.now())
        )
        return int(changed)
