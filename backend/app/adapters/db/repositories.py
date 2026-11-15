"""Repositories + Unit of Work. Rows are mapped to domain dataclasses here, so
services never touch the ORM."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from types import TracebackType
from typing import Any, Callable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...domain.alerts import AlertCandidate
from ...domain.errors import NotFound
from ...domain.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    AssemblyKind,
    AssemblyPoint,
    AuditEntry,
    Brigade,
    BrigadeStatus,
    CitizenState,
    RoadEdge,
    RoadNode,
    SOSSignal,
    SOSStatus,
    Zone,
)
from . import models as m


def _set(row: Any, fields: dict[str, Any]) -> None:
    for key, value in fields.items():
        setattr(row, key, value.value if isinstance(value, Enum) else value)


# --- row → domain mappers -------------------------------------------------

def _zone(r: m.ZoneRow) -> Zone:
    return Zone(r.id, r.name, r.lat, r.lng)


def _point(r: m.AssemblyPointRow) -> AssemblyPoint:
    return AssemblyPoint(
        id=r.id, name=r.name, kind=AssemblyKind(r.kind), lat=r.lat, lng=r.lng,
        capacity=r.capacity, occupancy=r.occupancy, is_active=r.is_active,
        is_reserve=r.is_reserve, zone_id=r.zone_id, is_accessible=r.is_accessible,
    )


def _brigade(r: m.BrigadeRow) -> Brigade:
    return Brigade(
        id=r.id, name=r.name, status=BrigadeStatus(r.status), lat=r.lat, lng=r.lng,
        target_lat=r.target_lat, target_lng=r.target_lng, target_alert_id=r.target_alert_id,
        eta_s=r.eta_s, route=[(p[0], p[1]) for p in (r.route or [])],
    )


def _edge(r: m.RoadEdgeRow) -> RoadEdge:
    return RoadEdge(r.id, r.name, r.source, r.target, r.length_m, r.is_open, r.is_accessible,
                    r.kind, [(p[0], p[1]) for p in (r.geometry or [])])


def _sos(r: m.SOSRow) -> SOSSignal:
    return SOSSignal(
        id=r.id, citizen_id=r.citizen_id, lat=r.lat, lng=r.lng, zone_id=r.zone_id,
        hazard_type=r.hazard_type, status=SOSStatus(r.status), created_at=r.created_at,
        resolved_at=r.resolved_at, priority=r.priority, citizen_role=r.citizen_role,
    )


def _alert(r: m.AlertRow) -> Alert:
    return Alert(
        id=r.id, rule_id=r.rule_id, severity=AlertSeverity(r.severity),
        status=AlertStatus(r.status), dedup_key=r.dedup_key, message=r.message,
        lat=r.lat, lng=r.lng, zone_id=r.zone_id, payload=dict(r.payload or {}),
        created_at=r.created_at, resolved_at=r.resolved_at, resolved_by=r.resolved_by,
        dismiss_reason=r.dismiss_reason, actions=dict(r.actions or {}),
    )


def _audit(r: m.AuditRow) -> AuditEntry:
    return AuditEntry(r.id, r.actor, r.action, r.alert_id, dict(r.details or {}), r.created_at)


def _citizen(r: m.CitizenStateRow) -> CitizenState:
    return CitizenState(
        citizen_id=r.citizen_id, role=r.role or "standard", lat=r.lat, lng=r.lng,
        is_safe=r.is_safe, safe_at=r.safe_at,
        target_point_id=r.target_point_id, manual_target=bool(r.manual_target),
        edge_ids=list(r.edge_ids or []),
        distance_m=r.distance_m, updated_at=r.updated_at,
    )


# --- repositories ---------------------------------------------------------

class _Repo:
    def __init__(self, session: Session) -> None:
        self.s = session

    def _require(self, row_cls: type[Any], key: Any, label: str, lock: bool = False) -> Any:
        row = self.s.get(row_cls, key, with_for_update=lock or None)
        if row is None:
            raise NotFound(f"{label} tapılmadı: {key}")
        return row


class ZoneRepo(_Repo):
    def list(self) -> list[Zone]:
        return [_zone(r) for r in self.s.scalars(select(m.ZoneRow).order_by(m.ZoneRow.name))]

    def get(self, zone_id: str) -> Zone:
        return _zone(self._require(m.ZoneRow, zone_id, "Zona"))


class PointRepo(_Repo):
    def list(self, active_only: bool = False) -> list[AssemblyPoint]:
        query = select(m.AssemblyPointRow).order_by(m.AssemblyPointRow.id)
        if active_only:
            query = query.where(m.AssemblyPointRow.is_active.is_(True))
        return [_point(r) for r in self.s.scalars(query)]

    def get(self, point_id: int) -> AssemblyPoint:
        return _point(self._require(m.AssemblyPointRow, point_id, "Toplanış nöqtəsi"))

    def update(self, point_id: int, **fields: Any) -> AssemblyPoint:
        row = self._require(m.AssemblyPointRow, point_id, "Toplanış nöqtəsi")
        _set(row, fields)
        self.s.flush()
        return _point(row)


class BrigadeRepo(_Repo):
    def list(self) -> list[Brigade]:
        return [_brigade(r) for r in self.s.scalars(select(m.BrigadeRow).order_by(m.BrigadeRow.id))]

    def get(self, brigade_id: int) -> Brigade:
        return _brigade(self._require(m.BrigadeRow, brigade_id, "Briqada"))

    def update(self, brigade_id: int, **fields: Any) -> Brigade:
        row = self._require(m.BrigadeRow, brigade_id, "Briqada")
        if "route" in fields:
            fields["route"] = [list(p) for p in fields["route"]]
        _set(row, fields)
        self.s.flush()
        return _brigade(row)


class RoadRepo(_Repo):
    def nodes(self) -> list[RoadNode]:
        rows = self.s.scalars(select(m.RoadNodeRow).order_by(m.RoadNodeRow.id))
        return [RoadNode(r.id, r.lat, r.lng) for r in rows]

    def edges(self) -> list[RoadEdge]:
        return [_edge(r) for r in self.s.scalars(select(m.RoadEdgeRow).order_by(m.RoadEdgeRow.id))]

    def get_edge(self, edge_id: str) -> RoadEdge:
        return _edge(self._require(m.RoadEdgeRow, edge_id, "Yol"))

    def set_open(self, edge_id: str, is_open: bool) -> RoadEdge:
        row = self._require(m.RoadEdgeRow, edge_id, "Yol")
        row.is_open = is_open
        self.s.flush()
        return _edge(row)

    def inaccessible_ids(self) -> frozenset[str]:
        """Roads with barriers (stairs, steep sections): unusable by wheelchair."""
        query = select(m.RoadEdgeRow.id).where(m.RoadEdgeRow.is_accessible.is_(False))
        return frozenset(self.s.scalars(query))

    def closed_ids(self) -> frozenset[str]:
        query = select(m.RoadEdgeRow.id).where(m.RoadEdgeRow.is_open.is_(False))
        return frozenset(self.s.scalars(query))


class SOSRepo(_Repo):
    def add(self, **fields: Any) -> SOSSignal:
        row = m.SOSRow(status=SOSStatus.OPEN.value, **fields)
        self.s.add(row)
        self.s.flush()
        return _sos(row)

    def latest_open_for_citizen(self, citizen_id: str) -> SOSSignal | None:
        query = (
            select(m.SOSRow)
            .where(m.SOSRow.citizen_id == citizen_id, m.SOSRow.status == SOSStatus.OPEN.value)
            .order_by(m.SOSRow.created_at.desc(), m.SOSRow.id.desc())
            .limit(1)
        )
        row = self.s.scalars(query).first()
        return _sos(row) if row else None

    def open_since(self, since: datetime) -> list[SOSSignal]:
        query = select(m.SOSRow).where(
            m.SOSRow.status == SOSStatus.OPEN.value, m.SOSRow.created_at >= since
        )
        return [_sos(r) for r in self.s.scalars(query)]

    def list(self, status: SOSStatus | None = None, limit: int = 500) -> list[SOSSignal]:
        # Priority #1 first, then newest first.
        query = select(m.SOSRow).order_by(m.SOSRow.priority, m.SOSRow.id.desc()).limit(limit)
        if status:
            query = query.where(m.SOSRow.status == status.value)
        return [_sos(r) for r in self.s.scalars(query)]

    def resolve_for_citizen(self, citizen_id: str, now: datetime) -> list[SOSSignal]:
        query = select(m.SOSRow).where(
            m.SOSRow.citizen_id == citizen_id, m.SOSRow.status == SOSStatus.OPEN.value
        )
        rows = list(self.s.scalars(query))
        for row in rows:
            row.status = SOSStatus.RESOLVED.value
            row.resolved_at = now
        self.s.flush()
        return [_sos(r) for r in rows]


class AlertRepo(_Repo):
    def add(self, candidate: AlertCandidate, now: datetime) -> Alert:
        row = m.AlertRow(
            rule_id=candidate.rule_id, severity=candidate.severity.value,
            status=AlertStatus.OPEN.value, dedup_key=candidate.dedup_key,
            message=candidate.message, lat=candidate.lat, lng=candidate.lng,
            zone_id=candidate.zone_id, payload=candidate.payload, created_at=now, actions={},
        )
        self.s.add(row)
        self.s.flush()
        return _alert(row)

    def get(self, alert_id: int, lock: bool = False) -> Alert:
        return _alert(self._require(m.AlertRow, alert_id, "Həyəcan", lock=lock))

    def update(self, alert_id: int, **fields: Any) -> Alert:
        row = self._require(m.AlertRow, alert_id, "Həyəcan")
        _set(row, fields)
        self.s.flush()
        return _alert(row)

    def list(self, status: AlertStatus | None = None, limit: int = 100) -> list[Alert]:
        query = select(m.AlertRow).order_by(m.AlertRow.id.desc()).limit(limit)
        if status:
            query = query.where(m.AlertRow.status == status.value)
        return [_alert(r) for r in self.s.scalars(query)]

    def _active_filter(self, cooldown_start: datetime) -> Any:
        """Open, or closed so recently that the cooldown still applies."""
        return or_(
            m.AlertRow.status == AlertStatus.OPEN.value, m.AlertRow.resolved_at > cooldown_start
        )

    def find_blocking(self, dedup_key: str, cooldown_start: datetime) -> Alert | None:
        query = select(m.AlertRow).where(
            m.AlertRow.dedup_key == dedup_key, self._active_filter(cooldown_start)
        )
        row = self.s.scalars(query).first()
        return _alert(row) if row else None

    def active(self, rule_id: str, cooldown_start: datetime) -> list[Alert]:
        query = select(m.AlertRow).where(
            m.AlertRow.rule_id == rule_id, self._active_filter(cooldown_start)
        )
        return [_alert(r) for r in self.s.scalars(query)]


class AuditRepo(_Repo):
    def add(self, actor: str, action: str, alert_id: int | None, details: dict[str, Any],
            created_at: datetime) -> AuditEntry:
        row = m.AuditRow(actor=actor, action=action, alert_id=alert_id, details=details,
                         created_at=created_at)
        self.s.add(row)
        self.s.flush()
        return _audit(row)

    def list(self, limit: int = 100) -> list[AuditEntry]:
        query = select(m.AuditRow).order_by(m.AuditRow.id.desc()).limit(limit)
        return [_audit(r) for r in self.s.scalars(query)]


class CitizenRepo(_Repo):
    def get(self, citizen_id: str) -> CitizenState | None:
        row = self.s.get(m.CitizenStateRow, citizen_id)
        return _citizen(row) if row else None

    def upsert(self, citizen_id: str, **fields: Any) -> CitizenState:
        row = self.s.get(m.CitizenStateRow, citizen_id)
        if row is None:
            row = m.CitizenStateRow(citizen_id=citizen_id, role="standard", is_safe=False,
                                    manual_target=False, edge_ids=[])
            self.s.add(row)
        _set(row, fields)
        self.s.flush()
        return _citizen(row)

    def tracked(self) -> list[CitizenState]:
        """Citizens currently following an evacuation route."""
        query = select(m.CitizenStateRow).where(m.CitizenStateRow.target_point_id.is_not(None))
        return [_citizen(r) for r in self.s.scalars(query)]

    def safe_count(self) -> int:
        query = select(m.CitizenStateRow).where(m.CitizenStateRow.is_safe.is_(True))
        return len(list(self.s.scalars(query)))


class UnitOfWork:
    """One transaction. Use as a context manager and call `commit()` explicitly."""

    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self._factory = session_factory

    def __enter__(self) -> "UnitOfWork":
        self.session = self._factory()
        self.zones = ZoneRepo(self.session)
        self.points = PointRepo(self.session)
        self.brigades = BrigadeRepo(self.session)
        self.roads = RoadRepo(self.session)
        self.sos = SOSRepo(self.session)
        self.alerts = AlertRepo(self.session)
        self.audit = AuditRepo(self.session)
        self.citizens = CitizenRepo(self.session)
        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc: BaseException | None,
                 tb: TracebackType | None) -> None:
        # Anything not committed is rolled back, which is what makes
        # multi-step operations (alert confirmation) atomic.
        self.session.rollback()
        self.session.close()

    def commit(self) -> None:
        self.session.commit()


UowFactory = Callable[[], UnitOfWork]
