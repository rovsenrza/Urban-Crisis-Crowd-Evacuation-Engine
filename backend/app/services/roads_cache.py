"""The street network, serialized once and kept ready.

The network has thousands of segments. Reading it from the database and
serializing it took about 300 ms per request and blocked the event loop
while it did, which is what makes a busy system slow for everyone. Road
geometry never changes at run time, only `is_open` does, so the payload is
kept in memory, patched when a road opens or closes, and served as bytes
(already gzip-compressed for clients that accept it).
"""
from __future__ import annotations

import gzip
import json
from dataclasses import asdict
from typing import Any

from ..adapters.db.repositories import UowFactory
from ..domain.events import DomainEvent, RoadStatusChanged

_GZIP_LEVEL = 4


class RoadsCache:
    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow
        self._nodes: list[dict[str, Any]] | None = None
        self._edges: dict[str, dict[str, Any]] = {}
        self._json: bytes | None = None
        self._gzip: bytes | None = None

    # -- reads -----------------------------------------------------------------

    def json(self) -> bytes:
        """`{"nodes": [...], "edges": [...]}` as UTF-8 JSON."""
        if self._json is None:
            self._load()
            self._json = json.dumps(
                {"nodes": self._nodes, "edges": list(self._edges.values())},
                ensure_ascii=False, separators=(",", ":"),
            ).encode()
        return self._json

    def gzipped(self) -> bytes:
        if self._gzip is None:
            self._gzip = gzip.compress(self.json(), compresslevel=_GZIP_LEVEL)
        return self._gzip

    def closed_count(self) -> int:
        self._load()
        return sum(1 for edge in self._edges.values() if not edge["is_open"])

    # -- invalidation ----------------------------------------------------------

    async def on_event(self, event: DomainEvent) -> None:
        """Bus subscriber: patch one road, or start over after a system reset."""
        if isinstance(event, RoadStatusChanged):
            edge = self._edges.get(event.edge.id)
            if edge is not None:
                edge["is_open"] = event.edge.is_open
            self._json = self._gzip = None
        else:
            self.clear()

    def clear(self) -> None:
        self._nodes, self._edges = None, {}
        self._json = self._gzip = None

    def _load(self) -> None:
        if self._nodes is not None:
            return
        with self._uow() as uow:
            self._nodes = [asdict(node) for node in uow.roads.nodes()]
            self._edges = {edge.id: asdict(edge) for edge in uow.roads.edges()}
