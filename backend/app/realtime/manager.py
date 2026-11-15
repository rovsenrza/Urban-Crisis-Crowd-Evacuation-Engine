"""WebSocket connection registry."""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._operators: set[WebSocket] = set()
        self._citizens: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect_operator(self, ws: WebSocket) -> None:
        await ws.accept()
        self._operators.add(ws)

    async def connect_citizen(self, citizen_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._citizens[citizen_id].add(ws)

    def disconnect(self, ws: WebSocket, citizen_id: str | None = None) -> None:
        self._operators.discard(ws)
        if citizen_id is not None:
            self._citizens[citizen_id].discard(ws)
            if not self._citizens[citizen_id]:
                del self._citizens[citizen_id]

    async def send_operators(self, message: dict[str, Any]) -> None:
        await self._send(list(self._operators), message)

    async def send_citizen(self, citizen_id: str, message: dict[str, Any]) -> None:
        await self._send(list(self._citizens.get(citizen_id, ())), message)

    async def send_all_citizens(self, message: dict[str, Any]) -> None:
        sockets = [ws for group in self._citizens.values() for ws in group]
        await self._send(sockets, message)

    async def _send(self, sockets: list[WebSocket], message: dict[str, Any]) -> None:
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001 - dead socket: drop it, keep broadcasting
                log.debug("Dropping dead websocket")
                self._operators.discard(ws)
                for group in self._citizens.values():
                    group.discard(ws)

    def stats(self) -> dict[str, int]:
        return {"operators": len(self._operators),
                "citizens": sum(len(g) for g in self._citizens.values())}
