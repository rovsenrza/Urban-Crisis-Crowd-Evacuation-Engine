"""Evacuation planning: nearest assembly points by *route* distance."""
from __future__ import annotations

from ..adapters.db.repositories import UnitOfWork, UowFactory
from ..config import Settings
from ..domain.errors import ValidationFailed
from ..domain.evacuation import (
    EvacuationOption,
    EvacuationPlan,
    choose_recommended,
    is_eligible,
    occupancy_level,
    trim_options,
)
from ..domain.geo import GeoPoint
from ..domain.models import CitizenState
from ..domain.ports import Clock, RoutingProvider, routing_status
from ..domain.roles import CitizenRole, normalize_role, policy_for


class EvacuationService:
    def __init__(self, uow: UowFactory, routing: RoutingProvider, settings: Settings,
                 clock: Clock) -> None:
        self._uow, self._routing, self._settings, self._clock = uow, routing, settings, clock
        self._thresholds = settings.thresholds()

    # -- queries -------------------------------------------------------------

    def plan(self, lat: float | None, lng: float | None, zone_id: str | None,
             limit: int | None = None, role: CitizenRole | None = None) -> EvacuationPlan:
        """Read-only plan for a position or a district."""
        with self._uow() as uow:
            plan = self.build_plan(uow, self._origin(uow, lat, lng, zone_id), role)
        plan.selected_point_id = plan.recommended_point_id
        return self._trim(plan, limit)

    def citizen_state(self, citizen_id: str) -> CitizenState | None:
        with self._uow() as uow:
            return uow.citizens.get(citizen_id)

    def build_plan(self, uow: UnitOfWork, origin: GeoPoint,
                   role: CitizenRole | str | None = None) -> EvacuationPlan:
        """Every reachable active point, sorted by route distance.

        Roles with the barrier-free profile only get accessible assembly
        points, reached over accessible roads: roads with barriers are handed
        to the routing provider as blocked, exactly like closed roads.
        """
        accessible = policy_for(role).accessible_route
        points = uow.points.list(active_only=True)
        blocked = uow.roads.closed_ids()
        speed = self._settings.walk_speed_mps
        if accessible:
            points = [p for p in points if p.is_accessible]
            blocked = blocked | uow.roads.inaccessible_ids()
            speed = self._settings.accessible_speed_mps
        routes = self._routing.routes_to_many(origin, [p.position for p in points], blocked)
        health = routing_status(self._routing)
        options = [
            EvacuationOption(
                point=point,
                distance_m=route.distance_m,
                eta_s=round(route.distance_m / speed),
                geometry=route.geometry,
                edge_ids=route.edge_ids,
                level=occupancy_level(point.occupancy_pct, self._thresholds),
            )
            for point, route in zip(points, routes)
            if route is not None
        ]
        options.sort(key=lambda o: o.distance_m)
        recommended, all_full = choose_recommended(options, self._thresholds)
        return EvacuationPlan(
            origin=origin, options=options, recommended_point_id=recommended,
            reachable=bool(options), all_full=all_full, accessible=accessible,
            routing_mode=health.mode, fallback_source=health.fallback_source,
        )

    # -- commands ------------------------------------------------------------

    def track(self, citizen_id: str, lat: float | None = None, lng: float | None = None,
              zone_id: str | None = None, target_point_id: int | None = None,
              prefer_point_id: int | None = None, limit: int | None = None,
              role: CitizenRole | None = None) -> EvacuationPlan:
        """Compute a plan and remember it as the citizen's current route.

        `target_point_id` is an explicit choice by the citizen (honoured if
        reachable). `prefer_point_id` is a soft preference used on re-routing:
        kept only while that point is still below the re-route limit.
        `role` updates the citizen's role; when omitted the stored role is
        used, so automatic re-routing keeps the barrier-free profile.
        """
        now = self._clock.now()
        with self._uow() as uow:
            origin = self._origin(uow, lat, lng, zone_id)
            stored = uow.citizens.get(citizen_id)
            role = normalize_role(role or (stored.role if stored else None))
            plan = self.build_plan(uow, origin, role)
            selected = plan.recommended_point_id
            preferred = plan.option(prefer_point_id)
            if plan.option(target_point_id):
                selected = target_point_id
            elif preferred and is_eligible(preferred, self._thresholds):
                selected = prefer_point_id
            plan.selected_point_id = selected
            manual = selected is not None and selected != plan.recommended_point_id
            option = plan.selected
            uow.citizens.upsert(
                citizen_id, role=role, lat=origin.lat, lng=origin.lng, is_safe=False,
                safe_at=None,
                target_point_id=selected, manual_target=manual,
                edge_ids=option.edge_ids if option else [],
                distance_m=option.distance_m if option else None,
                updated_at=now,
            )
            uow.commit()
        return self._trim(plan, limit)

    # -- helpers -------------------------------------------------------------

    def _origin(self, uow: UnitOfWork, lat: float | None, lng: float | None,
                zone_id: str | None) -> GeoPoint:
        if lat is not None and lng is not None:
            return GeoPoint(lat, lng)
        if zone_id:
            return uow.zones.get(zone_id).position
        raise ValidationFailed("Koordinat (lat, lng) və ya rayon (zone_id) göstərilməlidir",
                               "origin_required")

    def _trim(self, plan: EvacuationPlan, limit: int | None) -> EvacuationPlan:
        keep = {i for i in (plan.recommended_point_id, plan.selected_point_id) if i is not None}
        plan.options = trim_options(plan.options, limit or self._settings.nearest_limit, keep)
        return plan
