from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.container import Container, build_container
from app.domain.events import DomainEvent
from app.domain.models import Alert, SOSSignal
from app.factory import create_app

START = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
TOKEN = "test-token"


class FakeClock:
    def __init__(self, start: datetime = START) -> None:
        self.current = start

    def now(self) -> datetime:
        return self.current

    def advance(self, seconds: float = 0, minutes: float = 0) -> None:
        self.current += timedelta(seconds=seconds, minutes=minutes)


class EventRecorder:
    def __init__(self) -> None:
        self.events: list[DomainEvent] = []

    async def __call__(self, event: DomainEvent) -> None:
        self.events.append(event)

    def of(self, event_type: type) -> list:
        return [e for e in self.events if isinstance(e, event_type)]


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = dict(
        database_url="sqlite://", brigade_sim_enabled=False, operator_token=TOKEN,
        operator_username="operator", operator_password="secret", operator_role="admin",
        observer_username="observer", observer_password="look-only",
        jwt_secret="test-jwt-secret", jwt_ttl_min=60,
        sos_cluster_radius_m=500, sos_cluster_window_min=5, sos_cluster_min_count=4,
        reroute_occupancy_pct=90, critical_occupancy_pct=95, alert_cooldown_min=10,
        sos_dedup_window_s=60, routing_provider="simulated", sim_enabled=True,
    )
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def container(clock: FakeClock) -> Container:
    return build_container(make_settings(), clock=clock)


@pytest.fixture
def events(container: Container) -> EventRecorder:
    recorder = EventRecorder()
    container.bus.subscribe(None, recorder)
    return recorder


@pytest.fixture
def client(container: Container) -> Iterator[TestClient]:
    with TestClient(create_app(container.settings, container)) as test_client:
        yield test_client


@pytest.fixture
def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def new_citizen() -> str:
    return str(uuid.uuid4())


async def raise_cluster_alert(container: Container, zone_id: str = "yasamal") -> Alert:
    """Four distinct SOS in one zone → exactly one open alert."""
    await container.simulation.random_sos(zone_id, 4, "collapse")
    alerts = container.decisions.list()
    assert len(alerts) == 1
    return alerts[0]


def open_sos(container: Container) -> list[SOSSignal]:
    from app.domain.models import SOSStatus

    return container.sos.list(SOSStatus.OPEN)
