"""APP_ENV=production: the server refuses to start with demo secrets."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.factory import create_app

from .conftest import make_settings

SAFE = dict(
    app_env="production",
    jwt_secret="k7Qw2mZp9Lx4Vb8Nc1Rt6Yh3Jd5Gf0Sa-prod",
    operator_password="a-real-operator-password",
    observer_password="",
    operator_token="",
    sim_enabled=False,
    cors_origins="https://evac.example.az",
)


def test_development_start_is_never_blocked():
    assert make_settings().production_problems() == []
    assert Settings().production_problems() == []  # the shipped defaults are for development


def test_production_refuses_every_demo_default():
    settings = make_settings(
        app_env="production",
        jwt_secret=Settings.model_fields["jwt_secret"].default,
        operator_password=Settings.model_fields["operator_password"].default,
        observer_password=Settings.model_fields["observer_password"].default,
        operator_token="demo-operator-token",
        sim_enabled=True,
        cors_origins="http://localhost:5173",
    )
    problems = " ".join(settings.production_problems())
    for name in ("JWT_SECRET", "OPERATOR_PASSWORD", "OBSERVER_PASSWORD", "OPERATOR_TOKEN", "SIM_ENABLED", "CORS_ORIGINS"):
        assert name in problems
    with pytest.raises(RuntimeError, match="APP_ENV=production"):
        create_app(settings)


def test_production_starts_with_a_proper_configuration_and_simulator_is_off():
    settings = make_settings(**SAFE)
    assert settings.production_problems() == []
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/api/v1/meta").json()["sim_enabled"] is False
        login = client.post("/api/v1/auth/login",
                            json={"username": "operator", "password": SAFE["operator_password"]})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['token']}"}
        assert client.get("/api/v1/dashboard/snapshot?roads=false", headers=headers).status_code == 200
        # The old static token no longer opens anything.
        assert client.get("/api/v1/sos", headers={"Authorization": "Bearer demo-operator-token"}).status_code == 401
