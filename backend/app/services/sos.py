"""SOS intake and "I am safe" status."""
from __future__ import annotations

from ..adapters.db.repositories import UowFactory
from ..config import Settings
from ..domain.errors import ValidationFailed
from ..domain.events import CitizenMarkedSafe, SOSCreated
from ..domain.geo import GeoPoint, nearest
from ..domain.hazards import HazardRegistry
from ..domain.models import SOSSignal, SOSStatus
from ..domain.ports import Clock, EventBus
from ..domain.roles import CitizenRole, normalize_role, policy_for


class SOSService:
    def __init__(self, uow: UowFactory, bus: EventBus, clock: Clock, settings: Settings,
                 hazards: HazardRegistry) -> None:
        self._uow, self._bus, self._clock = uow, bus, clock
        self._settings, self._hazards = settings, hazards

    async def create(self, citizen_id: str, lat: float, lng: float, hazard_type: str,
                     role: CitizenRole | None = None) -> tuple[SOSSignal, bool]:
        """Store an SOS. Returns (signal, is_duplicate).

        The citizen's role (given here or stored earlier) sets the priority:
        a mobility-impaired citizen's SOS is Priority #1 automatically.

        A repeated tap by the same citizen while their previous SOS is still
        open and younger than the dedup window returns that SOS instead.
        """
        if hazard_type not in self._hazards:
            raise ValidationFailed(
                f"Naməlum təhlükə növü: {hazard_type}", "unknown_hazard",
                {"allowed": self._hazards.codes()},
            )
        now = self._clock.now()
        with self._uow() as uow:
            last = uow.sos.latest_open_for_citizen(citizen_id)
            if last and (now - last.created_at).total_seconds() < self._settings.sos_dedup_window_s:
                return last, True
            zone = nearest(uow.zones.list(), GeoPoint(lat, lng), lambda z: z.position)
            stored = uow.citizens.get(citizen_id)
            role = normalize_role(role or (stored.role if stored else None))
            sos = uow.sos.add(citizen_id=citizen_id, lat=lat, lng=lng, zone_id=zone.id,
                              hazard_type=hazard_type, created_at=now,
                              priority=int(policy_for(role).sos_priority),
                              citizen_role=role.value)
            uow.citizens.upsert(citizen_id, role=role, lat=lat, lng=lng, is_safe=False,
                                safe_at=None, updated_at=now)
            uow.commit()
        await self._bus.publish(SOSCreated(sos=sos, occurred_at=now))
        return sos, False

    async def mark_safe(self, citizen_id: str) -> list[SOSSignal]:
        """Close every open SOS of the citizen and stop tracking their route."""
        now = self._clock.now()
        with self._uow() as uow:
            resolved = uow.sos.resolve_for_citizen(citizen_id, now)
            uow.citizens.upsert(citizen_id, is_safe=True, safe_at=now, target_point_id=None,
                                manual_target=False, edge_ids=[], distance_m=None,
                                updated_at=now)
            uow.commit()
        await self._bus.publish(
            CitizenMarkedSafe(citizen_id=citizen_id, resolved_sos_ids=[s.id for s in resolved],
                              occurred_at=now)
        )
        return resolved

    def list(self, status: SOSStatus | None = None) -> list[SOSSignal]:
        with self._uow() as uow:
            return uow.sos.list(status)
