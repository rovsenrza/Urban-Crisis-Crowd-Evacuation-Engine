"""SQLAlchemy 2 ORM rows. Works on SQLite and PostgreSQL."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[datetime]):
    """Always hand back timezone-aware UTC datetimes (SQLite drops tzinfo)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc) if value else None

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Base(DeclarativeBase):
    pass


class ZoneRow(Base):
    __tablename__ = "zones"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


class AssemblyPointRow(Base):
    __tablename__ = "assembly_points"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    capacity: Mapped[int] = mapped_column(Integer)
    occupancy: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_reserve: Mapped[bool] = mapped_column(Boolean, default=False)
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=True)
    zone_id: Mapped[str] = mapped_column(ForeignKey("zones.id"))


class BrigadeRow(Base):
    __tablename__ = "brigades"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    target_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_alert_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eta_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    route: Mapped[list[Any]] = mapped_column(JSON, default=list)


class RoadNodeRow(Base):
    __tablename__ = "road_nodes"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


class RoadEdgeRow(Base):
    __tablename__ = "road_edges"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(ForeignKey("road_nodes.id"))
    target: Mapped[str] = mapped_column(ForeignKey("road_nodes.id"))
    length_m: Mapped[float] = mapped_column(Float)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=True)
    kind: Mapped[str] = mapped_column(String(24), default="road")
    geometry: Mapped[list[Any]] = mapped_column(JSON, default=list)


class SOSRow(Base):
    __tablename__ = "sos_signals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    citizen_id: Mapped[str] = mapped_column(String(64), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    zone_id: Mapped[str] = mapped_column(ForeignKey("zones.id"), index=True)
    hazard_type: Mapped[str] = mapped_column(String(32))
    priority: Mapped[int] = mapped_column(Integer, default=3, index=True)
    citizen_role: Mapped[str] = mapped_column(String(32), default="standard")
    status: Mapped[str] = mapped_column(String(16), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class AlertRow(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[str] = mapped_column(String(32), index=True)
    severity: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), index=True)
    dedup_key: Mapped[str] = mapped_column(String(128), index=True)
    message: Mapped[str] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    zone_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dismiss_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    actions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class AuditRow(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    alert_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class CitizenStateRow(Base):
    __tablename__ = "citizen_states"
    citizen_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), default="standard")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_safe: Mapped[bool] = mapped_column(Boolean, default=False)
    safe_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    target_point_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manual_target: Mapped[bool] = mapped_column(Boolean, default=False)
    edge_ids: Mapped[list[Any]] = mapped_column(JSON, default=list)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
