"""Application configuration.

Priority: constructor args > environment > `.env` > YAML file (`CONFIG_FILE`,
default `config.yaml`) > defaults. No threshold is hard-coded elsewhere.
"""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    YamlConfigSettingsSource,
)

from .domain.models import Thresholds


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Urban Crisis & Crowd Evacuation Engine"
    # development | production. In production the app refuses to start with demo secrets.
    app_env: str = "development"
    database_url: str = "sqlite:///./data/evac.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    seed_on_start: bool = True

    # Operator demo auth
    operator_username: str = "operator"
    operator_password: str = "baku2026"
    operator_token: str = "demo-operator-token"
    # Role of the configured operator account: admin | dispatcher | observer.
    operator_role: str = "admin"
    # Second demo account with read-only access; an empty password disables it.
    observer_username: str = "observer"
    observer_password: str = "baku2026-view"
    # JWT sessions for the dispatcher console (HS256).
    jwt_secret: str = "demo-jwt-secret-change-me"
    jwt_ttl_min: int = 480
    login_rate_per_ip: int = 10  # sign-in attempts per IP per minute

    # Abuse protection for the public SOS endpoint.
    sos_rate_window_s: float = 60.0
    sos_rate_per_citizen: int = 5   # requests per citizen id per window
    sos_rate_per_ip: int = 30       # requests per client address per window
    # Duplicate filter: one address may report the same spot and hazard only once per window
    # (under any number of citizen ids). 0 disables it.
    sos_flood_same_spot: int = 1
    sos_flood_precision: int = 4    # decimals of a degree that define "the same spot" (~10 m)
    # Load shedding: SOS accepted from everyone per window; 0 = no cap (see docs before enabling).
    sos_global_per_window: int = 0
    sos_max_distance_km: float = 60.0  # SOS further than this from the city centre is rejected
    city_center_lat: float = 40.4000
    city_center_lng: float = 49.8700
    trust_forwarded_for: bool = False  # true only behind a proxy that sets X-Forwarded-For

    # Routing
    routing_provider: str = "simulated"  # simulated | osrm
    osrm_base_url: str = "https://router.project-osrm.org"
    osrm_profile: str = "foot"
    osrm_timeout_s: float = 5.0
    # Circuit breaker around an external routing provider.
    routing_breaker_failures: int = 3
    routing_breaker_reset_s: float = 30.0
    routing_static_detour: float = 1.35
    walk_speed_mps: float = 1.4
    accessible_speed_mps: float = 0.9  # wheelchair / assisted walking
    brigade_speed_mps: float = 12.0
    nearest_limit: int = 5

    # Crisis thresholds
    sos_cluster_radius_m: float = 500
    sos_cluster_window_min: float = 5
    sos_cluster_min_count: int = 4
    reroute_occupancy_pct: float = 90
    critical_occupancy_pct: float = 95
    alert_cooldown_min: float = 10
    occupancy_yellow_pct: float = 70
    occupancy_red_pct: float = 90
    sos_dedup_window_s: float = 60

    # Simulation
    sim_enabled: bool = True
    brigade_sim_enabled: bool = True
    brigade_tick_s: float = 2.0
    brigade_sim_speedup: float = 8.0  # demo: brigades move faster than real time

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        yaml_source = YamlConfigSettingsSource(
            settings_cls, yaml_file=os.getenv("CONFIG_FILE", "config.yaml")
        )
        return (init_settings, env_settings, dotenv_settings, yaml_source)

    def production_problems(self) -> list[str]:
        """Why this configuration must not run in production; empty when it may.

        The demo defaults are public (they are in the repository), so a
        production start with any of them left in place is refused.
        """
        if self.app_env.lower() != "production":
            return []
        defaults = Settings.model_fields
        problems: list[str] = []
        if self.jwt_secret == defaults["jwt_secret"].default or len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be set to a private value of at least 32 characters")
        if self.operator_password == defaults["operator_password"].default:
            problems.append("OPERATOR_PASSWORD still has the demo value")
        if self.observer_password == defaults["observer_password"].default:
            problems.append("OBSERVER_PASSWORD still has the demo value (set a new one, or empty to disable)")
        if self.operator_token:
            problems.append("OPERATOR_TOKEN (static service token) must be empty")
        if self.sim_enabled:
            problems.append("SIM_ENABLED must be false (the simulator can reset all data)")
        if "localhost" in self.cors_origins or "127.0.0.1" in self.cors_origins:
            problems.append("CORS_ORIGINS must list the real site origin, not localhost")
        return problems

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def thresholds(self) -> Thresholds:
        return Thresholds(
            sos_cluster_radius_m=self.sos_cluster_radius_m,
            sos_cluster_window_min=self.sos_cluster_window_min,
            sos_cluster_min_count=self.sos_cluster_min_count,
            reroute_occupancy_pct=self.reroute_occupancy_pct,
            critical_occupancy_pct=self.critical_occupancy_pct,
            alert_cooldown_min=self.alert_cooldown_min,
            occupancy_yellow_pct=self.occupancy_yellow_pct,
            occupancy_red_pct=self.occupancy_red_pct,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
