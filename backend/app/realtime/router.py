"""WebSocket endpoints.

  /ws/citizen/{citizen_id}   anonymous; personal re-route pushes + public updates
  /ws/operator?token=...     full live feed for the dashboard
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..api.deps import token_is_valid
from ..container import Container

router = APIRouter()

POLICY_VIOLATION = 1008


async def _keep_alive(ws: WebSocket) -> None:
    """Server → client only; inbound text is treated as a ping."""
    while True:
        if await ws.receive_text() == "ping":
            await ws.send_json({"type": "pong"})


@router.websocket("/ws/citizen/{citizen_id}")
async def citizen_socket(ws: WebSocket, citizen_id: str) -> None:
    container: Container = ws.app.state.container
    await container.connections.connect_citizen(citizen_id, ws)
    try:
        await _keep_alive(ws)
    except WebSocketDisconnect:
        pass
    finally:
        container.connections.disconnect(ws, citizen_id)


@router.websocket("/ws/operator")
async def operator_socket(ws: WebSocket, token: str | None = None) -> None:
    container: Container = ws.app.state.container
    if not token_is_valid(container, token):
        await ws.close(code=POLICY_VIOLATION)
        return
    await container.connections.connect_operator(ws)
    try:
        await _keep_alive(ws)
    except WebSocketDisconnect:
        pass
    finally:
        container.connections.disconnect(ws)
