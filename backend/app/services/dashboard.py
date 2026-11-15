"""Initial state for the operator dashboard (live deltas come via WebSocket)."""
from __future__ import annotations

from collections import Counter
from typing import Any

from ..adapters.db.repositories import UowFactory
from ..domain.models import AlertStatus, SOSStatus
from .roads_cache import RoadsCache


class DashboardService:
    def __init__(self, uow: UowFactory, roads: RoadsCache) -> None:
        self._uow, self._roads = uow, roads

    def snapshot(self) -> dict[str, Any]:
        """Everything but the street network, which `RoadsCache` serves ready-made."""
        with self._uow() as uow:
            open_sos = uow.sos.list(SOSStatus.OPEN)
            return {
                "zones": uow.zones.list(),
                "assembly_points": uow.points.list(),
                "brigades": uow.brigades.list(),
                "sos": open_sos,
                "sos_by_zone": dict(Counter(s.zone_id for s in open_sos)),
                "alerts": uow.alerts.list(AlertStatus.OPEN),
                "recent_alerts": uow.alerts.list(limit=20),
                "audit": uow.audit.list(limit=30),
                "stats": {
                    "open_sos": len(open_sos),
                    "priority_sos": sum(1 for s in open_sos if s.priority == 1),
                    "closed_roads": self._roads.closed_count(),
                    "safe_citizens": uow.citizens.safe_count(),
                    "tracked_citizens": len(uow.citizens.tracked()),
                },
            }
