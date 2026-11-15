"""Fake-SOS flood: rate limiting, duplicate filtering, and the console staying responsive."""
from __future__ import annotations

import random
import time
from datetime import timedelta

from fastapi.testclient import TestClient

from app.container import build_container
from app.factory import create_app
from app.services.rate_limit import SlidingWindowLimiter

from .conftest import FakeClock, make_settings, new_citizen

API = "/api/v1"
YASAMAL = (40.3853, 49.8127)
MAX_AVG_MS = 399


def sos(citizen: str, lat: float = YASAMAL[0], lng: float = YASAMAL[1], hazard: str = "fire") -> dict:
    return {"citizen_id": citizen, "lat": lat, "lng": lng, "hazard_type": hazard}


def scattered(rng: random.Random) -> tuple[float, float]:
    """A random position inside Baku, so requests are not caught by the duplicate filter."""
    return 40.36 + rng.random() * 0.08, 49.80 + rng.random() * 0.12


def test_limiter_allows_up_to_the_limit_then_says_when_to_retry(clock: FakeClock):
    limiter = SlidingWindowLimiter(clock)
    assert [limiter.hit("k", 3, 60) for _ in range(3)] == [None, None, None]
    assert limiter.hit("k", 3, 60) == 60
    clock.current += timedelta(seconds=20)
    assert limiter.hit("k", 3, 60) == 40
    assert limiter.hit("other", 3, 60) is None  # keys are independent
    clock.current += timedelta(seconds=41)  # the first three left the window
    assert limiter.hit("k", 3, 60) is None


def test_flood_of_600_fake_sos_is_rejected_fast_and_never_reaches_the_console(client: TestClient, auth):
    """600 SOS with unique citizen ids from one address: only the per-address quota is stored."""
    rng = random.Random(7)
    client.get(f"{API}/roads")  # the street-network cache is built at server start-up, not on a request
    started = time.perf_counter()
    statuses = [client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng))).status_code
                for _ in range(600)]
    average_ms = (time.perf_counter() - started) * 1000 / len(statuses)

    assert statuses.count(201) == 30 and statuses.count(429) == 570
    assert average_ms < MAX_AVG_MS, f"average {average_ms:.1f} ms"

    # The dispatcher sees 30 signals, not 600, and the console answers quickly.
    started = time.perf_counter()
    snapshot = client.get(f"{API}/dashboard/snapshot", headers=auth)
    assert (time.perf_counter() - started) * 1000 < MAX_AVG_MS
    assert snapshot.status_code == 200 and snapshot.json()["stats"]["open_sos"] == 30


def test_rejection_explains_itself(client: TestClient):
    rng = random.Random(1)
    for _ in range(30):
        client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng)))
    blocked = client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng)))
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert blocked.json()["error"]["details"]["retry_after_s"] == 60
    assert blocked.headers["retry-after"] == "60"


def test_same_spot_under_new_citizen_ids_is_filtered_as_a_duplicate(client: TestClient, auth):
    """The scripted flood: one payload replayed with a fresh citizen id each time."""
    first = client.post(f"{API}/sos", json=sos(new_citizen()))
    assert first.status_code == 201
    replays = [client.post(f"{API}/sos", json=sos(new_citizen())) for _ in range(10)]
    assert {r.status_code for r in replays} == {429}
    assert {r.json()["error"]["code"] for r in replays} == {"duplicate_signal"}
    assert client.get(f"{API}/dashboard/snapshot", headers=auth).json()["stats"]["open_sos"] == 1
    # A different hazard at the same spot is a different report.
    assert client.post(f"{API}/sos", json=sos(new_citizen(), hazard="flood")).status_code == 201


def test_a_citizen_repeating_their_own_sos_gets_the_existing_one_then_the_limit(client: TestClient):
    citizen = new_citizen()
    assert client.post(f"{API}/sos", json=sos(citizen)).status_code == 201
    repeats = [client.post(f"{API}/sos", json=sos(citizen)) for _ in range(4)]
    assert all(r.status_code == 200 and r.json()["duplicate"] for r in repeats)
    sixth = client.post(f"{API}/sos", json=sos(citizen))  # 5 per minute per citizen
    assert sixth.status_code == 429 and sixth.json()["error"]["code"] == "rate_limited"


def test_limits_lift_when_the_window_passes(client: TestClient, clock: FakeClock):
    rng = random.Random(3)
    for _ in range(30):
        client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng)))
    assert client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng))).status_code == 429
    clock.current += timedelta(seconds=61)
    assert client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng))).status_code == 201


def test_position_outside_the_service_area_is_rejected(client: TestClient):
    far = client.post(f"{API}/sos", json=sos(new_citizen(), 41.7, 44.8))  # Tbilisi
    assert far.status_code == 422 and far.json()["error"]["code"] == "outside_service_area"


def test_forwarded_address_is_only_believed_behind_a_trusted_proxy(clock: FakeClock):
    def flood(trust: bool) -> list[int]:
        container = build_container(make_settings(trust_forwarded_for=trust, sos_rate_per_ip=5), clock=clock)
        rng = random.Random(5)
        with TestClient(create_app(container.settings, container)) as client:
            return [client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng)),
                                headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code
                    for i in range(12)]

    # Not trusted: the header is ignored, so spoofing it does not dodge the limit.
    assert flood(trust=False).count(201) == 5
    # Trusted proxy: each real client address has its own quota.
    assert flood(trust=True).count(201) == 12


def test_optional_global_cap_sheds_load_from_many_addresses(clock: FakeClock):
    container = build_container(
        make_settings(trust_forwarded_for=True, sos_global_per_window=50), clock=clock)
    rng = random.Random(9)
    with TestClient(create_app(container.settings, container)) as client:
        statuses = [client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng)),
                                headers={"X-Forwarded-For": f"10.{i // 250}.{i % 250}.1"}).status_code
                    for i in range(500)]
    assert statuses.count(201) == 50 and statuses.count(429) == 450


def test_critical_dispatcher_action_still_works_right_after_a_flood(client: TestClient, auth):
    rng = random.Random(11)
    for _ in range(500):
        client.post(f"{API}/sos", json=sos(new_citizen(), *scattered(rng)))
    alerts = client.get(f"{API}/alerts?status=open", headers=auth).json()
    assert alerts, "30 accepted SOS across the city still raise a cluster alert"
    started = time.perf_counter()
    confirmed = client.post(f"{API}/alerts/{alerts[0]['id']}/confirm", headers=auth)
    assert (time.perf_counter() - started) * 1000 < MAX_AVG_MS
    assert confirmed.status_code == 200 and confirmed.json()["brigade"] is not None
