"""HTTP + WebSocket contract tests."""
from __future__ import annotations

import time

import pytest
from starlette.websockets import WebSocketDisconnect

from .conftest import TOKEN, new_citizen

API = "/api/v1"


def receive_until(ws, message_type: str, limit: int = 30) -> dict:
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == message_type:
            return message
    raise AssertionError(f"'{message_type}' not received")


def sos_body(citizen: str, hazard: str = "fire") -> dict:
    return {"citizen_id": citizen, "lat": 40.3830, "lng": 49.8100, "hazard_type": hazard}


def test_openapi_and_meta(client):
    assert client.get(f"{API}/openapi.json").status_code == 200
    assert client.get("/docs").status_code == 200
    meta = client.get(f"{API}/meta").json()
    assert len(meta["zones"]) == 8
    assert {h["code"] for h in meta["hazards"]} == {"fire", "collapse", "flood", "medical"}
    assert meta["thresholds"]["critical_occupancy_pct"] == 95


def test_seed_data_shape(client):
    points = client.get(f"{API}/assembly-points").json()
    assert 12 <= len(points) <= 15
    assert len([p for p in points if p["is_reserve"] and not p["is_active"]]) == 3
    assert {p["kind"] for p in points} == {"shelter", "park", "stadium"}
    # Real street network of Baku (OpenStreetMap), not a synthetic grid.
    roads = client.get(f"{API}/roads").json()
    assert len(roads["nodes"]) > 1000 and len(roads["edges"]) > 1000
    assert all(len(e["geometry"]) >= 2 and e["name"] for e in roads["edges"])
    assert any("küçəsi" in e["name"] or "prospekti" in e["name"] for e in roads["edges"])


def test_sos_created_then_duplicate(client):
    citizen = new_citizen()
    first = client.post(f"{API}/sos", json=sos_body(citizen))
    assert first.status_code == 201
    assert first.json()["duplicate"] is False
    assert first.json()["sos"]["zone_id"] == "yasamal"
    second = client.post(f"{API}/sos", json=sos_body(citizen))
    assert second.status_code == 200
    assert second.json() == {"sos": first.json()["sos"], "duplicate": True}


def test_safe_closes_sos_and_updates_state(client):
    citizen = new_citizen()
    sos_id = client.post(f"{API}/sos", json=sos_body(citizen)).json()["sos"]["id"]
    assert client.get(f"{API}/citizens/{citizen}/state").json()["open_sos"]["id"] == sos_id
    safe = client.post(f"{API}/citizens/{citizen}/safe").json()
    assert safe == {"citizen_id": citizen, "is_safe": True, "resolved_sos_ids": [sos_id]}
    state = client.get(f"{API}/citizens/{citizen}/state").json()
    assert state["is_safe"] is True and state["open_sos"] is None


def test_error_format_is_consistent(client, auth):
    cases = [
        (client.post(f"{API}/sos", json=sos_body(new_citizen(), "meteor")), 422, "unknown_hazard"),
        (client.post(f"{API}/sos", json={"citizen_id": "x"}), 422, "validation_error"),
        (client.get(f"{API}/assembly-points/nearest"), 422, "origin_required"),
        (client.get(f"{API}/assembly-points/nearest?zone_id=atlantis"), 404, "not_found"),
        (client.post(f"{API}/sim/roads/nope/close", headers=auth), 404, "not_found"),
        (client.get(f"{API}/alerts"), 401, "unauthorized"),
        (client.get(f"{API}/nope"), 404, "not_found"),
    ]
    for response, status, code in cases:
        assert response.status_code == status
        error = response.json()["error"]
        assert set(error) == {"code", "message", "details"} and error["code"] == code


def test_operator_auth(client, auth):
    for path in ("alerts", "sos", "brigades", "audit-log", "dashboard/snapshot", "sim/scenario"):
        assert client.get(f"{API}/{path}").status_code == 401
        assert client.get(f"{API}/{path}", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert client.get(f"{API}/{path}", headers=auth).status_code == 200
    bad = client.post(f"{API}/auth/login", json={"username": "operator", "password": "x"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"
    good = client.post(f"{API}/auth/login", json={"username": "operator", "password": "secret"})
    session = good.json()
    assert session["role"] == "admin" and session["token"].count(".") == 2  # a JWT, not the static token
    assert client.get(f"{API}/dashboard/snapshot",
                      headers={"Authorization": f"Bearer {session['token']}"}).status_code == 200


def test_sim_road_close_and_open(client, auth):
    edge = client.get(f"{API}/roads").json()["edges"][10]["id"]
    assert client.post(f"{API}/sim/roads/{edge}/close").status_code == 401
    closed = client.post(f"{API}/sim/roads/{edge}/close", headers=auth).json()
    assert closed["is_open"] is False
    edges = {e["id"]: e for e in client.get(f"{API}/roads").json()["edges"]}
    assert edges[edge]["is_open"] is False
    assert client.post(f"{API}/sim/roads/{edge}/open", headers=auth).json()["is_open"] is True


def test_citizen_receives_reroute_push_over_websocket(client, auth):
    citizen = new_citizen()
    plan = client.post(f"{API}/citizens/{citizen}/route", json={"zone_id": "yasamal"}).json()
    selected = next(o for o in plan["options"] if o["point"]["id"] == plan["selected_point_id"])
    edge = selected["edge_ids"][0]
    with client.websocket_connect(f"/ws/citizen/{citizen}") as ws:
        client.post(f"{API}/sim/roads/{edge}/close", headers=auth)
        assert receive_until(ws, "road.changed")["data"]["edge"]["id"] == edge
        push = receive_until(ws, "citizen.rerouted")
        assert push["data"]["reason"] == "road_closed" and push["data"]["changed"] is True
        new_plan = push["data"]["plan"]
        new_route = next(o for o in new_plan["options"]
                         if o["point"]["id"] == new_plan["selected_point_id"])
        assert edge not in new_route["edge_ids"] and len(new_route["geometry"]) >= 2

        # Target reaches 90 % → next best assembly point.
        target = new_plan["selected_point_id"]
        client.post(f"{API}/sim/assembly-points/{target}/occupancy", headers=auth,
                    json={"occupancy_pct": 90})
        push = receive_until(ws, "citizen.rerouted")
        assert push["data"]["reason"] == "point_full"
        assert push["data"]["plan"]["selected_point_id"] != target


def test_operator_websocket_requires_token(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/operator?token=wrong") as ws:
            ws.receive_json()


def test_operator_live_feed_and_confirm_flow(client, auth):
    with client.websocket_connect(f"/ws/operator?token={TOKEN}") as ws:
        created = client.post(f"{API}/sim/sos", headers=auth,
                              json={"zone_id": "yasamal", "count": 4, "hazard_type": "collapse"})
        assert len(created.json()) == 4
        alert = receive_until(ws, "alert.raised")["data"]["alert"]
        assert alert["severity"] == "red" and alert["payload"]["count"] == 4
        assert alert["message"] == "Əlavə xilasetmə briqadası göndər və yeni toplanış nöqtəsi aç"

        confirmed = client.post(f"{API}/alerts/{alert['id']}/confirm", headers=auth).json()
        assert confirmed["already_processed"] is False
        assert confirmed["brigade"]["status"] == "en_route"
        assert confirmed["activated_point"]["is_active"] is True
        assert receive_until(ws, "brigade.changed")["data"]["brigade"]["id"] == confirmed["brigade"]["id"]
        assert receive_until(ws, "assembly.activated")
        assert receive_until(ws, "alert.confirmed")["data"]["alert"]["status"] == "confirmed"

    again = client.post(f"{API}/alerts/{alert['id']}/confirm", headers=auth).json()
    assert again["already_processed"] is True
    assert again["brigade"]["id"] == confirmed["brigade"]["id"]
    audit = client.get(f"{API}/audit-log", headers=auth).json()
    assert [a["action"] for a in audit].count("alert.confirmed") == 1
    snapshot = client.get(f"{API}/dashboard/snapshot", headers=auth).json()
    assert snapshot["sos_by_zone"] == {"yasamal": 4} and snapshot["alerts"] == []


def test_dismiss_alert_via_api(client, auth):
    client.post(f"{API}/sim/sos", headers=auth, json={"zone_id": "nizami", "count": 4})
    alert_id = client.get(f"{API}/alerts?status=open", headers=auth).json()[0]["id"]
    assert client.post(f"{API}/alerts/{alert_id}/dismiss", headers=auth, json={}).status_code == 422
    dismissed = client.post(f"{API}/alerts/{alert_id}/dismiss", headers=auth,
                            json={"reason": "Yanlış siqnal"}).json()
    assert dismissed["status"] == "dismissed" and dismissed["dismiss_reason"] == "Yanlış siqnal"
    conflict = client.post(f"{API}/alerts/{alert_id}/confirm", headers=auth)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "alert_dismissed"


def test_earthquake_scenario_shows_every_alert_type(client, auth):
    started = client.post(f"{API}/sim/scenario/earthquake", headers=auth, json={"speed": 0})
    assert started.status_code == 202
    deadline = time.time() + 10
    while client.get(f"{API}/sim/scenario", headers=auth).json()["running"]:
        assert time.time() < deadline, "scenario did not finish"
        time.sleep(0.05)
    status = client.get(f"{API}/sim/scenario", headers=auth).json()
    assert status["step"] == status["total"] == 9 and status["message"] == "Ssenari başa çatdı"
    assert status["code"] == "done"

    alerts = client.get(f"{API}/alerts", headers=auth).json()
    kinds = sorted((a["rule_id"], a["payload"].get("scope")) for a in alerts)
    assert kinds == [("overcrowding", None), ("sos_cluster", "radius"), ("sos_cluster", "zone")]
    assert all(e["is_open"] for e in client.get(f"{API}/roads").json()["edges"])
    assert client.post(f"{API}/sim/scenario/unknown", headers=auth).status_code == 404


def test_reset_restores_seed_state(client, auth):
    client.post(f"{API}/sim/sos", headers=auth, json={"zone_id": "xetai", "count": 5})
    client.post(f"{API}/sim/roads/random", headers=auth, json={"action": "close", "count": 5})
    assert client.post(f"{API}/sim/reset", headers=auth).status_code == 204
    snapshot = client.get(f"{API}/dashboard/snapshot", headers=auth).json()
    assert snapshot["sos"] == [] and snapshot["stats"]["closed_roads"] == 0
    assert snapshot["recent_alerts"] == []
