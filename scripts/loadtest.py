#!/usr/bin/env python3
"""Fake-SOS flood against a running backend, with the dispatcher console polled meanwhile.

    python3 scripts/loadtest.py                                   # 5000 SOS over 500 connections
    python3 scripts/loadtest.py --requests 20000 --connections 1000
    python3 scripts/loadtest.py --same-spot                       # one payload replayed (duplicate filter)

Opens `--connections` keep-alive connections at once (a bot farm or a panic),
sends SOS requests with a new citizen id each, and times every response from
the moment it is written to the moment the full answer is read. A separate
connection polls the dispatcher's SOS list during the flood. Exits 1 when an
average response time reaches the limit (399 ms by default).

Standard library only, with a deliberately thin HTTP client: a heavier
client would measure its own queueing instead of the server's.

For numbers that mean something, run the server the way production would:

    cd backend && .venv/bin/uvicorn app.main:app --port 8000 --no-access-log
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import statistics
import sys
import time
import uuid
from collections import Counter
from urllib.parse import urlparse

HAZARDS = ["fire", "collapse", "flood", "medical"]


class Connection:
    """One keep-alive HTTP/1.1 connection."""

    def __init__(self, host: str, port: int) -> None:
        self.host, self.port = host, port
        self.reader: asyncio.StreamReader | None = None
        self.writer: asyncio.StreamWriter | None = None

    async def open(self) -> None:
        self.reader, self.writer = await asyncio.open_connection(self.host, self.port)

    async def request(self, method: str, path: str, body: bytes = b"", token: str = "") -> tuple[int, float]:
        """Send one request; return (status, milliseconds until the whole response was read)."""
        assert self.reader and self.writer
        head = [f"{method} {path} HTTP/1.1", f"Host: {self.host}:{self.port}", f"Content-Length: {len(body)}"]
        if body:
            head.append("Content-Type: application/json")
        if token:
            head.append(f"Authorization: Bearer {token}")
        started = time.perf_counter()
        self.writer.write(("\r\n".join(head) + "\r\n\r\n").encode() + body)
        await self.writer.drain()
        raw = await self.reader.readuntil(b"\r\n\r\n")
        status = int(raw[9:12])
        length = 0
        for line in raw.split(b"\r\n")[1:]:
            if line[:15].lower() == b"content-length:":
                length = int(line[15:])
        if length:
            await self.reader.readexactly(length)
        return status, (time.perf_counter() - started) * 1000

    def close(self) -> None:
        if self.writer:
            self.writer.close()


def summarize(name: str, times_ms: list[float], statuses: Counter, limit_ms: float) -> bool:
    if not times_ms:
        print(f"{name}: no responses")
        return False
    ordered = sorted(times_ms)
    average = statistics.fmean(ordered)
    p95 = ordered[max(0, int(len(ordered) * 0.95) - 1)]
    ok = average < limit_ms
    codes = ", ".join(f"{code}: {count}" for code, count in sorted(statuses.items(), key=lambda kv: str(kv[0])))
    print(f"{name}: {len(ordered)} responses ({codes})")
    print(f"  average {average:.1f} ms | median {statistics.median(ordered):.1f} ms | "
          f"p95 {p95:.1f} ms | max {ordered[-1]:.1f} ms  →  {'OK' if ok else 'TOO SLOW'} (limit {limit_ms:.0f} ms)")
    return ok


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--requests", type=int, default=5000)
    parser.add_argument("--connections", type=int, default=500, help="simultaneous connections")
    parser.add_argument("--token", default="demo-operator-token", help="operator token for the console polls")
    parser.add_argument("--limit-ms", type=float, default=399)
    parser.add_argument("--same-spot", action="store_true", help="replay one position (duplicate filter)")
    args = parser.parse_args()

    url = urlparse(args.api_url)
    host, port = url.hostname or "localhost", url.port or 80
    rng = random.Random(42)

    def fake_sos() -> bytes:
        lat, lng = (40.3853, 49.8127) if args.same_spot else (40.36 + rng.random() * 0.08, 49.80 + rng.random() * 0.12)
        return json.dumps({"citizen_id": str(uuid.uuid4()), "lat": lat, "lng": lng,
                           "hazard_type": "fire" if args.same_spot else rng.choice(HAZARDS)}).encode()

    connections = [Connection(host, port) for _ in range(args.connections)]
    await asyncio.gather(*(c.open() for c in connections))
    console = Connection(host, port)
    await console.open()

    remaining = args.requests
    sos_times: list[float] = []
    sos_statuses: Counter = Counter()
    console_times: list[float] = []
    console_statuses: Counter = Counter()
    flooding = True

    async def flood(connection: Connection) -> None:
        nonlocal remaining
        while remaining > 0:
            remaining -= 1
            try:
                status, elapsed = await connection.request("POST", "/api/v1/sos", fake_sos())
            except (OSError, asyncio.IncompleteReadError, ValueError) as error:
                sos_statuses[type(error).__name__] += 1
                return
            sos_statuses[status] += 1
            sos_times.append(elapsed)

    async def poll_console() -> None:
        while flooding:
            status, elapsed = await console.request("GET", "/api/v1/sos?status=open", token=args.token)
            console_statuses[status] += 1
            console_times.append(elapsed)
            await asyncio.sleep(0.02)

    poller = asyncio.create_task(poll_console())
    wall = time.perf_counter()
    await asyncio.gather(*(flood(c) for c in connections))
    wall = time.perf_counter() - wall
    flooding = False
    await poller
    for connection in (*connections, console):
        connection.close()

    print(f"\n{args.requests} fake SOS over {args.connections} simultaneous connections "
          f"in {wall:.2f} s ({args.requests / wall:.0f} requests/s)")
    ok_sos = summarize("SOS endpoint", sos_times, sos_statuses, args.limit_ms)
    ok_console = summarize("Dispatcher console (GET /sos)", console_times, console_statuses, args.limit_ms)
    return 0 if ok_sos and ok_console else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
