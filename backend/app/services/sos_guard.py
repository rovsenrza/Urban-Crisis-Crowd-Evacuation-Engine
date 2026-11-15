"""Abuse protection for the public SOS endpoint.

A panic or a bot can send hundreds of SOS requests at once. Every check here
is an in-memory lookup that runs before the database is touched, so a flood
is rejected in microseconds and never reaches the dispatcher console:

1. geofence      the position must be inside the service area;
2. load shedding optional cap on SOS accepted from everyone per window;
3. per address   requests from one client address per window;
4. per citizen   requests from one citizen id per window;
5. duplicates    one address reporting the same spot and hazard again under
                 another citizen id (the classic scripted flood).

A citizen repeating their own SOS passes these checks and is answered by the
service's own de-duplication (HTTP 200, `duplicate: true`).

Limits of this layer, stated plainly: a botnet with many addresses, each
sending one plausible SOS, looks like a real crisis and is not stopped here.
That needs proof of a real device or person upstream (app attestation, SMS
verification, CAPTCHA at the gateway).
"""
from __future__ import annotations

from datetime import datetime

from ..config import Settings
from ..domain.errors import TooManyRequests, ValidationFailed
from ..domain.geo import haversine_m
from ..domain.ports import Clock
from .rate_limit import SlidingWindowLimiter

_SWEEP_EVERY = 2_000


class SosGuard:
    def __init__(self, limiter: SlidingWindowLimiter, settings: Settings, clock: Clock) -> None:
        self._limiter, self._settings, self._clock = limiter, settings, clock
        # (address, spot, hazard) → (citizen id that reported it first, when)
        self._spots: dict[tuple[str, float, float, str], tuple[str, datetime]] = {}
        self._checks = 0
        self.rejected = 0  # for /health and the load test

    def check(self, citizen_id: str, address: str, lat: float, lng: float, hazard: str) -> None:
        """Raise `ValidationFailed` or `TooManyRequests`; return when the SOS may proceed."""
        cfg = self._settings
        window = cfg.sos_rate_window_s
        try:
            self._geofence(lat, lng)
            if cfg.sos_global_per_window > 0:
                self._limit("sos:all", cfg.sos_global_per_window, window,
                            "Sistem həddən artıq yüklənib. Bir qədər sonra yenidən cəhd edin.")
            self._limit(f"sos:ip:{address}", cfg.sos_rate_per_ip, window,
                        "Bu ünvandan çox tez-tez SOS göndərilir. Bir qədər sonra yenidən cəhd edin.")
            self._limit(f"sos:citizen:{citizen_id}", cfg.sos_rate_per_citizen, window,
                        "Çox tez-tez SOS göndərilir. Bir qədər sonra yenidən cəhd edin.")
            self._duplicate(citizen_id, address, lat, lng, hazard)
        except (TooManyRequests, ValidationFailed):
            self.rejected += 1
            raise

    def reset(self) -> None:
        self._spots.clear()
        self.rejected = 0

    # -- checks ----------------------------------------------------------------

    def _geofence(self, lat: float, lng: float) -> None:
        cfg = self._settings
        distance_km = haversine_m(lat, lng, cfg.city_center_lat, cfg.city_center_lng) / 1000
        if cfg.sos_max_distance_km > 0 and distance_km > cfg.sos_max_distance_km:
            raise ValidationFailed("Mövqe xidmət ərazisindən kənardadır", "outside_service_area",
                                   {"max_distance_km": cfg.sos_max_distance_km})

    def _limit(self, key: str, limit: int, window_s: float, message: str) -> None:
        retry_after = self._limiter.hit(key, limit, window_s)
        if retry_after is not None:
            raise TooManyRequests(message, details={"retry_after_s": round(retry_after)})

    def _duplicate(self, citizen_id: str, address: str, lat: float, lng: float, hazard: str) -> None:
        cfg = self._settings
        if cfg.sos_flood_same_spot <= 0:
            return
        now = self._clock.now()
        self._checks += 1
        if self._checks % _SWEEP_EVERY == 0:
            self._spots = {k: v for k, v in self._spots.items()
                           if (now - v[1]).total_seconds() < cfg.sos_rate_window_s}

        precision = cfg.sos_flood_precision
        key = (address, round(lat, precision), round(lng, precision), hazard)
        seen = self._spots.get(key)
        if seen is None or (now - seen[1]).total_seconds() >= cfg.sos_rate_window_s:
            self._spots[key] = (citizen_id, now)
            return
        first_citizen, at = seen
        if first_citizen == citizen_id:
            return  # the same person again: the service answers with their existing SOS
        retry_after = cfg.sos_rate_window_s - (now - at).total_seconds()
        raise TooManyRequests(
            "Bu yerdən eyni növ SOS artıq qəbul olunub. Xilasedicilər məlumatlıdır.",
            "duplicate_signal", {"retry_after_s": max(1, round(retry_after))},
        )
