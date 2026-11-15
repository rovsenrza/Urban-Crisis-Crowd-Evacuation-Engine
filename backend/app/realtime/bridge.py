"""Event bus → WebSocket bridge.

Subscribes to every event and forwards it according to an audience table, so
adding a new event to the live feed is one line here.

Wire format: {"type": "<event name>", "ts": "<ISO-8601 UTC>", "data": {...}}
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Any

from fastapi.encoders import jsonable_encoder

from ..domain import events as ev
from ..domain.ports import EventBus
from .manager import ConnectionManager


@dataclass(frozen=True)
class Audience:
    operators: bool = True
    all_citizens: bool = False
    citizen_attr: str | None = None  # event attribute holding the target citizen id


AUDIENCES: dict[type[ev.DomainEvent], Audience] = {
    ev.SOSCreated: Audience(),
    ev.CitizenMarkedSafe: Audience(citizen_attr="citizen_id"),
    ev.RoadStatusChanged: Audience(all_citizens=True),
    ev.AssemblyOccupancyChanged: Audience(all_citizens=True),
    ev.AssemblyPointActivated: Audience(all_citizens=True),
    ev.AlertRaised: Audience(),
    ev.AlertConfirmed: Audience(),
    ev.AlertDismissed: Audience(),
    ev.BrigadeStatusChanged: Audience(),
    ev.CitizenRerouted: Audience(citizen_attr="citizen_id"),
    ev.ScenarioProgress: Audience(),
    ev.SystemReset: Audience(all_citizens=True),
}


def to_message(event: ev.DomainEvent) -> dict[str, Any]:
    data = dataclasses.asdict(event)
    ts = data.pop("occurred_at")
    return jsonable_encoder({"type": event.name, "ts": ts, "data": data})


def operator_view(event: ev.DomainEvent, message: dict[str, Any]) -> dict[str, Any]:
    """Operators only need a summary of a citizen's re-route, not the geometry."""
    if isinstance(event, ev.CitizenRerouted):
        data = {k: v for k, v in message["data"].items() if k != "plan"}
        data["selected_point_id"] = event.plan.selected_point_id
        return {**message, "data": data}
    return message


class RealtimeBridge:
    def __init__(self, connections: ConnectionManager) -> None:
        self._connections = connections

    def attach(self, bus: EventBus) -> None:
        bus.subscribe(None, self._forward)

    async def _forward(self, event: ev.DomainEvent) -> None:
        audience = AUDIENCES.get(type(event))
        if audience is None:
            return
        message = to_message(event)
        if audience.operators:
            await self._connections.send_operators(operator_view(event, message))
        if audience.all_citizens:
            await self._connections.send_all_citizens(message)
        elif audience.citizen_attr:
            await self._connections.send_citizen(getattr(event, audience.citizen_attr), message)
