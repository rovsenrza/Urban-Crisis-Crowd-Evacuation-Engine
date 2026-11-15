"""Engine / session factory. SQLite by default, PostgreSQL via DATABASE_URL."""
from __future__ import annotations

import os

import logging

from sqlalchemy import Engine, create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .models import Base


def make_engine(database_url: str) -> Engine:
    if database_url.startswith("sqlite"):
        kwargs: dict[str, object] = {"connect_args": {"check_same_thread": False}}
        if database_url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool  # one shared in-memory connection
        else:
            path = database_url.split("///", 1)[-1]
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        return create_engine(database_url, **kwargs)
    return create_engine(database_url, pool_pre_ping=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def create_schema(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def schema_is_current(engine: Engine) -> bool:
    """False when an existing table lacks a column the models expect."""
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    for table in Base.metadata.tables.values():
        if table.name not in existing:
            continue
        columns = {c["name"] for c in inspector.get_columns(table.name)}
        if not {c.name for c in table.columns} <= columns:
            return False
    return True


def ensure_schema(engine: Engine) -> None:
    """Create the schema; rebuild it when it is out of date.

    There are no migrations in this prototype and the database only holds demo
    data, so an outdated schema is dropped and re-created (then re-seeded).
    """
    if not schema_is_current(engine):
        logging.getLogger(__name__).warning("Database schema is outdated: rebuilding demo data")
        drop_schema(engine)
    create_schema(engine)


def drop_schema(engine: Engine) -> None:
    Base.metadata.drop_all(engine)
