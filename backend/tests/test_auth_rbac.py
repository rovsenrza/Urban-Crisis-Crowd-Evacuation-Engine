"""JWT sessions and role-based access to the dispatcher's critical operations."""
from __future__ import annotations

import base64
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.container import build_container
from app.domain.errors import Unauthorized
from app.factory import create_app
from app.services import auth

from .conftest import TOKEN, FakeClock, make_settings

API = "/api/v1"
SECRET = "test-jwt-secret"


def login(client: TestClient, username: str, password: str) -> dict:
    response = client.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def raise_alert(client: TestClient) -> int:
    """Four SOS from different citizens in one district → one open RED alert."""
    created = client.post(f"{API}/sim/sos", json={"zone_id": "yasamal", "count": 4}, headers=bearer(TOKEN))
    assert created.status_code == 200, created.text
    alerts = client.get(f"{API}/alerts", params={"status": "open"}, headers=bearer(TOKEN)).json()
    assert alerts
    return alerts[0]["id"]


def make_client(clock: FakeClock, **settings: object) -> TestClient:
    container = build_container(make_settings(**settings), clock=clock)
    return TestClient(create_app(container.settings, container))


# -- token ---------------------------------------------------------------------


def test_token_round_trip_and_tampering(clock: FakeClock):
    token = auth.issue_token("leyla", auth.DISPATCHER, clock.now(), timedelta(minutes=5), SECRET)
    claims = auth.verify_token(token, clock.now(), SECRET)
    assert (claims.sub, claims.role) == ("leyla", "dispatcher")

    header, payload, signature = token.split(".")
    forged_payload = base64.urlsafe_b64encode(
        json.dumps({"sub": "leyla", "role": "admin", "exp": claims.exp}).encode()).rstrip(b"=").decode()
    unsigned_header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    bad_tokens = [
        f"{header}.{forged_payload}.{signature}",       # role changed, old signature
        f"{header}.{payload}.{signature[:-2]}xx",       # signature altered
        f"{unsigned_header}.{forged_payload}.",         # alg=none
        auth.issue_token("leyla", "admin", clock.now(), timedelta(minutes=5), "another-secret"),
        auth.issue_token("leyla", "superuser", clock.now(), timedelta(minutes=5), SECRET),  # unknown role
        "not-a-token", "a.b", "",
    ]
    for bad in bad_tokens:
        with pytest.raises(Unauthorized):
            auth.verify_token(bad, clock.now(), SECRET)


def test_token_expires(clock: FakeClock):
    token = auth.issue_token("leyla", auth.ADMIN, clock.now(), timedelta(minutes=5), SECRET)
    clock.advance(minutes=4, seconds=59)
    auth.verify_token(token, clock.now(), SECRET)
    clock.advance(seconds=1)
    with pytest.raises(Unauthorized) as expired:
        auth.verify_token(token, clock.now(), SECRET)
    assert expired.value.code == "token_expired"


# -- sign-in -------------------------------------------------------------------


def test_login_returns_a_jwt_carrying_the_role(client: TestClient, clock: FakeClock):
    session = login(client, "operator", "secret")
    assert session["operator"] == "operator" and session["role"] == "admin"
    assert session["expires_in"] == 3600 and session["token"] != TOKEN
    claims = auth.verify_token(session["token"], clock.now(), SECRET)
    assert (claims.sub, claims.role) == ("operator", "admin")

    me = client.get(f"{API}/auth/me", headers=bearer(session["token"])).json()
    assert me == {"operator": "operator", "role": "admin",
                  "permissions": ["console:read", "alerts:decide", "brigades:manage", "simulation:run"]}
    assert client.get(f"{API}/auth/me").status_code == 401

    observer = login(client, "observer", "look-only")
    assert observer["role"] == "observer"
    me = client.get(f"{API}/auth/me", headers=bearer(observer["token"])).json()
    assert me["permissions"] == ["console:read"]


def test_wrong_password_and_disabled_observer(clock: FakeClock):
    with make_client(clock, observer_password="") as client:
        for username, password in (("operator", "x"), ("observer", ""), ("observer", "look-only"), ("nobody", "secret")):
            bad = client.post(f"{API}/auth/login", json={"username": username, "password": password})
            assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"


def test_expired_session_is_401_on_the_api(client: TestClient, clock: FakeClock):
    token = login(client, "operator", "secret")["token"]
    assert client.get(f"{API}/dashboard/snapshot", headers=bearer(token)).status_code == 200
    clock.advance(minutes=61)
    expired = client.get(f"{API}/dashboard/snapshot", headers=bearer(token))
    assert expired.status_code == 401 and expired.json()["error"]["code"] == "token_expired"


def test_login_is_rate_limited_per_address(clock: FakeClock):
    with make_client(clock, login_rate_per_ip=3) as client:
        for _ in range(3):
            assert client.post(f"{API}/auth/login", json={"username": "operator", "password": "x"}).status_code == 401
        blocked = client.post(f"{API}/auth/login", json={"username": "operator", "password": "secret"})
        assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "rate_limited"
        assert int(blocked.headers["retry-after"]) >= 1
        clock.advance(seconds=61)
        assert client.post(f"{API}/auth/login", json={"username": "operator", "password": "secret"}).status_code == 200


# -- roles ---------------------------------------------------------------------


def test_observer_reads_everything_but_cannot_act(client: TestClient):
    alert_id = raise_alert(client)
    observer = bearer(login(client, "observer", "look-only")["token"])
    brigades_before = client.get(f"{API}/brigades", headers=observer).json()

    for path in ("dashboard/snapshot", "sos", "brigades", "alerts", "audit-log"):
        assert client.get(f"{API}/{path}", headers=observer).status_code == 200, path

    denied = [
        client.post(f"{API}/alerts/{alert_id}/confirm", headers=observer),
        client.post(f"{API}/alerts/{alert_id}/dismiss", json={"reason": "test"}, headers=observer),
        client.patch(f"{API}/brigades/1/status", json={"status": "on_site"}, headers=observer),
        client.post(f"{API}/sim/sos", json={"zone_id": "yasamal", "count": 1}, headers=observer),
        client.post(f"{API}/sim/roads/open-all", headers=observer),
        client.get(f"{API}/sim/scenario", headers=observer),
        client.post(f"{API}/sim/reset", headers=observer),
    ]
    for response in denied:
        assert response.status_code == 403, response.request.url
        assert response.json()["error"]["code"] == "forbidden"

    # Nothing happened: the alert is still open and no brigade left.
    alerts = client.get(f"{API}/alerts", params={"status": "open"}, headers=observer).json()
    assert [a["id"] for a in alerts] == [alert_id]
    assert client.get(f"{API}/brigades", headers=observer).json() == brigades_before


def test_dispatcher_sends_a_brigade_but_cannot_run_the_simulator(clock: FakeClock):
    with make_client(clock, operator_role="dispatcher") as client:
        alert_id = raise_alert(client)
        session = login(client, "operator", "secret")
        assert session["role"] == "dispatcher"
        dispatcher = bearer(session["token"])

        confirmed = client.post(f"{API}/alerts/{alert_id}/confirm", headers=dispatcher)
        assert confirmed.status_code == 200, confirmed.text
        result = confirmed.json()
        assert result["alert"]["status"] == "confirmed" and result["alert"]["resolved_by"] == "operator"
        assert result["brigade"]["status"] == "en_route"  # the rescue brigade was dispatched

        brigade_id = result["brigade"]["id"]
        changed = client.patch(f"{API}/brigades/{brigade_id}/status", json={"status": "on_site"}, headers=dispatcher)
        assert changed.status_code == 200 and changed.json()["status"] == "on_site"

        for response in (client.post(f"{API}/sim/reset", headers=dispatcher),
                         client.post(f"{API}/sim/roads/open-all", headers=dispatcher)):
            assert response.status_code == 403 and response.json()["error"]["code"] == "forbidden"

        # The audit trail names the person from the token, not a shared account.
        audit = client.get(f"{API}/audit-log", headers=dispatcher).json()
        confirmation = next(entry for entry in audit if entry["action"] == "alert.confirmed")
        assert confirmation["actor"] == "operator" and confirmation["alert_id"] == alert_id


def test_admin_can_do_everything(client: TestClient):
    alert_id = raise_alert(client)
    admin = bearer(login(client, "operator", "secret")["token"])
    dismissed = client.post(f"{API}/alerts/{alert_id}/dismiss", json={"reason": "təlim"}, headers=admin)
    assert dismissed.status_code == 200 and dismissed.json()["status"] == "dismissed"
    assert client.post(f"{API}/sim/roads/open-all", headers=admin).status_code == 200
    assert client.post(f"{API}/sim/reset", headers=admin).status_code == 204


def test_service_token_is_an_admin_and_can_be_switched_off(clock: FakeClock):
    with make_client(clock) as client:
        assert client.get(f"{API}/auth/me", headers=bearer(TOKEN)).json()["role"] == "admin"
    with make_client(clock, operator_token="") as client:
        assert client.get(f"{API}/dashboard/snapshot", headers=bearer(TOKEN)).status_code == 401
        assert client.get(f"{API}/dashboard/snapshot", headers=bearer("")).status_code == 401
        token = login(client, "operator", "secret")["token"]
        assert client.get(f"{API}/dashboard/snapshot", headers=bearer(token)).status_code == 200


# -- live socket ---------------------------------------------------------------


def test_operator_socket_takes_a_jwt_of_any_role_and_rejects_garbage(client: TestClient, clock: FakeClock):
    for username, password in (("operator", "secret"), ("observer", "look-only")):
        token = login(client, username, password)["token"]
        with client.websocket_connect(f"/ws/operator?token={token}") as ws:
            ws.send_text("ping")
            assert ws.receive_json() == {"type": "pong"}

    expired = login(client, "operator", "secret")["token"]
    clock.advance(minutes=61)
    for bad in ("garbage", expired, ""):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/ws/operator?token={bad}") as ws:
                ws.receive_json()
