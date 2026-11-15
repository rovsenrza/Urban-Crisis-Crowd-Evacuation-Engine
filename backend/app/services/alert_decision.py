"""Operator decisions on alerts: one-click confirm (atomic) and dismiss."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..adapters.db.repositories import UnitOfWork, UowFactory
from ..config import Settings
from ..domain.errors import Conflict, ValidationFailed
from ..domain.events import (
    AlertConfirmed,
    AlertDismissed,
    AssemblyPointActivated,
    BrigadeStatusChanged,
)
from ..domain.geo import GeoPoint, distance_m
from ..domain.models import Alert, AlertStatus, AssemblyPoint, Brigade, BrigadeStatus, Route
from ..domain.ports import Clock, EventBus, RoutingProvider


@dataclass
class ConfirmResult:
    alert: Alert
    brigade: Brigade | None
    activated_point: AssemblyPoint | None
    already_processed: bool


class AlertDecisionService:
    def __init__(self, uow: UowFactory, bus: EventBus, routing: RoutingProvider,
                 settings: Settings, clock: Clock) -> None:
        self._uow, self._bus, self._routing = uow, bus, routing
        self._settings, self._clock = settings, clock

    def list(self, status: AlertStatus | None = None) -> list[Alert]:
        with self._uow() as uow:
            return uow.alerts.list(status)

    async def confirm(self, alert_id: int, operator: str) -> ConfirmResult:
        """Dispatch nearest available brigade + open nearest reserve point.

        Everything is written in a single transaction: either the brigade, the
        reserve point, the alert status and the audit entry all change, or
        nothing does. A second confirmation returns the first result unchanged.
        """
        now = self._clock.now()
        with self._uow() as uow:
            alert = uow.alerts.get(alert_id, lock=True)
            if alert.status is AlertStatus.CONFIRMED:
                return self._previous_result(uow, alert)
            if alert.status is AlertStatus.DISMISSED:
                raise Conflict("Həyəcan artıq rədd edilib", "alert_dismissed")

            target = alert.position
            closed = uow.roads.closed_ids()
            brigade, brigade_route = self._nearest_available_brigade(uow, target, closed)
            point, point_route = self._nearest_reserve_point(uow, target, closed)

            actions: dict[str, Any] = {
                "brigade_id": None, "brigade_name": None, "brigade_distance_m": None,
                "activated_point_id": None, "activated_point_name": None,
            }
            if brigade:
                distance = brigade_route.distance_m if brigade_route else distance_m(brigade.position, target)
                brigade = uow.brigades.update(
                    brigade.id, status=BrigadeStatus.EN_ROUTE, target_lat=target.lat,
                    target_lng=target.lng, target_alert_id=alert.id,
                    eta_s=round(distance / self._settings.brigade_speed_mps),
                    route=brigade_route.geometry if brigade_route
                    else [brigade.position.as_tuple(), target.as_tuple()],
                )
                actions.update(brigade_id=brigade.id, brigade_name=brigade.name,
                               brigade_distance_m=round(distance), brigade_eta_s=brigade.eta_s)
            if point:
                point = uow.points.update(point.id, is_active=True)
                actions.update(activated_point_id=point.id, activated_point_name=point.name,
                               activated_point_distance_m=round(point_route.distance_m)
                               if point_route else None)

            alert = uow.alerts.update(alert.id, status=AlertStatus.CONFIRMED, resolved_at=now,
                                      resolved_by=operator, actions=actions)
            uow.audit.add(operator, "alert.confirmed", alert.id,
                          {"rule_id": alert.rule_id, "zone_id": alert.zone_id, **actions}, now)
            uow.commit()

        if brigade:
            await self._bus.publish(BrigadeStatusChanged(brigade=brigade, occurred_at=now))
        if point:
            await self._bus.publish(AssemblyPointActivated(point=point, occurred_at=now))
        # Subscribers (re-routing, WebSocket) react to the confirmed decision.
        await self._bus.publish(
            AlertConfirmed(alert=alert, brigade=brigade, activated_point=point, occurred_at=now)
        )
        return ConfirmResult(alert, brigade, point, already_processed=False)

    async def dismiss(self, alert_id: int, operator: str, reason: str) -> Alert:
        if not reason.strip():
            raise ValidationFailed("Rədd etmə səbəbi göstərilməlidir", "reason_required")
        now = self._clock.now()
        with self._uow() as uow:
            alert = uow.alerts.get(alert_id, lock=True)
            if alert.status is AlertStatus.DISMISSED:
                return alert
            if alert.status is AlertStatus.CONFIRMED:
                raise Conflict("Həyəcan artıq təsdiqlənib", "alert_confirmed")
            alert = uow.alerts.update(alert.id, status=AlertStatus.DISMISSED, resolved_at=now,
                                      resolved_by=operator, dismiss_reason=reason.strip())
            uow.audit.add(operator, "alert.dismissed", alert.id, {"reason": reason.strip()}, now)
            uow.commit()
        await self._bus.publish(AlertDismissed(alert=alert, occurred_at=now))
        return alert

    # -- helpers -------------------------------------------------------------

    def _previous_result(self, uow: UnitOfWork, alert: Alert) -> ConfirmResult:
        brigade_id = alert.actions.get("brigade_id")
        point_id = alert.actions.get("activated_point_id")
        return ConfirmResult(
            alert,
            uow.brigades.get(brigade_id) if brigade_id else None,
            uow.points.get(point_id) if point_id else None,
            already_processed=True,
        )

    def _nearest_available_brigade(self, uow: UnitOfWork, target: GeoPoint,
                                   closed: frozenset[str]) -> tuple[Brigade | None, Route | None]:
        """Nearest by route distance; straight line only if nothing is routable."""
        available = [b for b in uow.brigades.list() if b.status is BrigadeStatus.AVAILABLE]
        if not available:
            return None, None
        routed = [(b, self._routing.route(b.position, target, closed)) for b in available]
        reachable = [(b, r) for b, r in routed if r is not None]
        if reachable:
            return min(reachable, key=lambda pair: pair[1].distance_m)
        return min(available, key=lambda b: distance_m(b.position, target)), None

    def _nearest_reserve_point(self, uow: UnitOfWork, target: GeoPoint,
                               closed: frozenset[str]) -> tuple[AssemblyPoint | None, Route | None]:
        reserves = [p for p in uow.points.list() if p.is_reserve and not p.is_active]
        if not reserves:
            return None, None
        routes = self._routing.routes_to_many(target, [p.position for p in reserves], closed)
        reachable = [(p, r) for p, r in zip(reserves, routes) if r is not None]
        if reachable:
            return min(reachable, key=lambda pair: pair[1].distance_m)
        return min(reserves, key=lambda p: distance_m(p.position, target)), None
