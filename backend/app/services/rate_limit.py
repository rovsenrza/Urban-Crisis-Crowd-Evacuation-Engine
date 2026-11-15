"""In-process sliding-window rate limiter.

Cheap by design: one dict lookup and a deque per key, no database and no
`await`, so a flood is turned away before it costs anything. State lives in
this process (the app runs as a single worker; a multi-replica deployment
would move it to Redis behind the same interface).
"""
from __future__ import annotations

from collections import deque
from datetime import datetime

from ..domain.ports import Clock

# Forget idle keys after this many checks, so a flood of unique keys cannot grow memory forever.
_SWEEP_EVERY = 5_000


class SlidingWindowLimiter:
    def __init__(self, clock: Clock) -> None:
        self._clock = clock
        self._hits: dict[str, deque[datetime]] = {}
        self._checks = 0
        self._longest_window_s = 0.0

    def hit(self, key: str, limit: int, window_s: float) -> float | None:
        """Count one request for `key`.

        Returns None when it is allowed, otherwise the seconds until the
        oldest counted request leaves the window. A rejected request is not
        counted, so a blocked client is not blocked for longer by retrying.
        """
        if limit <= 0:
            return None  # limit disabled
        now = self._clock.now()
        self._longest_window_s = max(self._longest_window_s, window_s)
        self._checks += 1
        if self._checks % _SWEEP_EVERY == 0:
            self._sweep(now)

        hits = self._hits.setdefault(key, deque())
        while hits and (now - hits[0]).total_seconds() >= window_s:
            hits.popleft()
        if len(hits) >= limit:
            return max(1.0, window_s - (now - hits[0]).total_seconds())
        hits.append(now)
        return None

    def peek(self, key: str, limit: int, window_s: float) -> float | None:
        """Like `hit`, but counts nothing: seconds to wait if `key` is already at its limit."""
        if limit <= 0:
            return None
        hits = self._hits.get(key)
        if not hits:
            return None
        now = self._clock.now()
        while hits and (now - hits[0]).total_seconds() >= window_s:
            hits.popleft()
        if len(hits) >= limit:
            return max(1.0, window_s - (now - hits[0]).total_seconds())
        return None

    def count(self, key: str, window_s: float) -> int:
        """Requests counted for `key` inside the window, without adding one."""
        now = self._clock.now()
        hits = self._hits.get(key)
        if not hits:
            return 0
        return sum(1 for at in hits if (now - at).total_seconds() < window_s)

    def reset(self) -> None:
        self._hits.clear()

    def _sweep(self, now: datetime) -> None:
        stale = [key for key, hits in self._hits.items()
                 if not hits or (now - hits[-1]).total_seconds() >= self._longest_window_s]
        for key in stale:
            del self._hits[key]
