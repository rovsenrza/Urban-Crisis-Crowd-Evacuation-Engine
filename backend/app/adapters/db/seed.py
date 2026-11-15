"""Demo seed data for Baku + deterministic simulated road graph."""
from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path

import networkx as nx
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from ...domain.geo import GeoPoint, haversine_m, nearest
from ...domain.models import RoadEdge, RoadGraph, RoadNode, Zone
from . import models as m

ZONES: list[Zone] = [
    Zone("nesimi", "Nəsimi", 40.3920, 49.8440),
    Zone("yasamal", "Yasamal", 40.3830, 49.8100),
    Zone("sebail", "Səbail", 40.3600, 49.8300),
    Zone("nerimanov", "Nərimanov", 40.4080, 49.8700),
    Zone("nizami", "Nizami", 40.4000, 49.9300),
    Zone("xetai", "Xətai", 40.3800, 49.9000),
    Zone("bineqedi", "Binəqədi", 40.4480, 49.8200),
    Zone("sabuncu", "Sabunçu", 40.4430, 49.9450),
]

# (name, kind, lat, lng, capacity, occupancy, is_reserve). Coordinates are approximate.
ASSEMBLY_POINTS: list[tuple[str, str, float, float, int, int, bool]] = [
    ("Dənizkənarı Milli Park", "park", 40.3690, 49.8430, 8000, 2400, False),
    ("Tofiq Bəhramov adına Respublika Stadionu", "stadium", 40.3974, 49.8526, 12000, 6600, False),
    ("Bakı Olimpiya Stadionu", "stadium", 40.4300, 49.9197, 20000, 5000, False),
    ("Heydər Əliyev Mərkəzi parkı", "park", 40.3959, 49.8678, 5000, 3900, False),
    ("Mərkəzi Botanika bağı", "park", 40.3560, 49.8130, 4000, 800, False),
    ("Zabitlər parkı", "park", 40.3840, 49.8270, 2500, 1500, False),
    ("Dədə Qorqud parkı", "park", 40.4040, 49.8590, 3500, 1200, False),
    ("Koroğlu parkı", "park", 40.4195, 49.9150, 2500, 2125, False),
    ("İdman-Konsert Kompleksi sığınacağı", "shelter", 40.3942, 49.8232, 6000, 2700, False),
    ("Xətai Mədəniyyət Mərkəzi sığınacağı", "shelter", 40.3830, 49.8990, 1500, 450, False),
    ("Binəqədi Mədəniyyət və İstirahət Parkı", "park", 40.4500, 49.8250, 3000, 600, False),
    ("Sabunçu Mədəniyyət Sarayı sığınacağı", "shelter", 40.4420, 49.9470, 1200, 300, False),
    ("Bakı Kristal Zalı (ehtiyat)", "shelter", 40.3442, 49.8500, 10000, 0, True),
    ("Bakı Ekspo Mərkəzi (ehtiyat)", "shelter", 40.4155, 49.9560, 9000, 0, True),
    ("Bakı İdman Sarayı (ehtiyat)", "shelter", 40.3765, 49.8475, 4000, 0, True),
]

# (name, status, lat, lng, target)
BRIGADES: list[tuple[str, str, float, float, tuple[float, float] | None]] = [
    ("Briqada 01 · Nəsimi", "available", 40.3905, 49.8420, None),
    ("Briqada 02 · Yasamal", "available", 40.3800, 49.8080, None),
    ("Briqada 03 · Səbail", "available", 40.3610, 49.8300, None),
    ("Briqada 04 · Nərimanov", "available", 40.4080, 49.8700, None),
    ("Briqada 05 · Nizami", "on_site", 40.4010, 49.9300, None),
    ("Briqada 06 · Xətai", "available", 40.3800, 49.8950, None),
    ("Briqada 07 · Binəqədi", "returning", 40.4400, 49.8300, None),
    ("Briqada 08 · Sabunçu", "en_route", 40.4430, 49.9450, (40.4300, 49.9197)),
]

# Assembly points without a barrier-free entrance (demo assumption, not real data).
INACCESSIBLE_POINTS = {
    "Zabitlər parkı",
    "Mərkəzi Botanika bağı",
    "Koroğlu parkı",
    "Sabunçu Mədəniyyət Sarayı sığınacağı",
}
INACCESSIBLE_ROAD_SHARE = 0.25

# Real street network of Baku, built from OpenStreetMap by scripts/build_road_graph.py.
ROAD_FILE = Path(__file__).parent / "data" / "baku_roads.json"

GRID_ROWS, GRID_COLS = 8, 10
LAT_MIN, LAT_MAX = 40.352, 40.457
LNG_MIN, LNG_MAX = 49.790, 49.960


def _in_sea(lat: float, lng: float) -> bool:
    """Rough mask for the Bay of Baku so no road node lands in the water."""
    return lat < 40.375 and lng > 49.848


@lru_cache(maxsize=1)
def load_road_graph() -> RoadGraph:
    """The city's road network: real streets when the data file is present,
    otherwise the synthetic grid (so the project still runs without it)."""
    if not ROAD_FILE.exists():
        return build_baku_graph()
    data = json.loads(ROAD_FILE.read_text(encoding="utf-8"))
    nodes = [RoadNode(node_id, lat, lng) for node_id, (lat, lng) in data["nodes"].items()]
    edges = [
        RoadEdge(
            id=e["id"],
            # Unnamed streets get a number so every road can be referred to.
            name=e["name"] or f"Yol {int(e['id'][1:])}",
            source=e["s"], target=e["t"], length_m=e["len"], is_accessible=e["acc"],
            kind=e["kind"], geometry=[(lat, lng) for lat, lng in e["geom"]],
        )
        for e in data["edges"]
    ]
    return RoadGraph(nodes, edges)


def build_baku_graph(seed: int = 42) -> RoadGraph:
    """Fallback: jittered grid over the city (68 nodes / 118 edges)."""
    rng = random.Random(seed)
    lat_step = (LAT_MAX - LAT_MIN) / (GRID_ROWS - 1)
    lng_step = (LNG_MAX - LNG_MIN) / (GRID_COLS - 1)
    nodes: dict[tuple[int, int], RoadNode] = {}
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            lat, lng = LAT_MIN + row * lat_step, LNG_MIN + col * lng_step
            if _in_sea(lat, lng):
                continue
            # Small jitter so the network does not look like graph paper.
            lat += rng.uniform(-0.0022, 0.0022)
            lng += rng.uniform(-0.0030, 0.0030)
            nodes[(row, col)] = RoadNode(f"n{row}{col}", round(lat, 6), round(lng, 6))
    edges: list[RoadEdge] = []
    for (row, col), node in nodes.items():
        for neighbour in ((row, col + 1), (row + 1, col)):
            other = nodes.get(neighbour)
            if other is None:
                continue
            number = len(edges) + 1
            length = haversine_m(node.lat, node.lng, other.lat, other.lng)
            edges.append(
                RoadEdge(f"e{number:03d}", f"Yol {number}", node.id, other.id, round(length, 1))
            )
    graph = RoadGraph(list(nodes.values()), edges)
    mark_inaccessible_roads(graph)
    return graph


def mark_inaccessible_roads(graph: RoadGraph, seed: int = 7) -> None:
    """Flag about a quarter of the roads as having barriers (stairs, steep
    sections). A road is only flagged if the barrier-free network stays
    connected *without bridges*: every place keeps at least two independent
    barrier-free ways out, so one closed road never strands a wheelchair user."""
    rng = random.Random(seed)
    network = nx.Graph()
    network.add_nodes_from(n.id for n in graph.nodes)
    network.add_edges_from((e.source, e.target) for e in graph.edges)
    candidates = list(graph.edges)
    rng.shuffle(candidates)
    remaining = round(len(graph.edges) * INACCESSIBLE_ROAD_SHARE)
    for edge in candidates:
        if remaining == 0:
            break
        network.remove_edge(edge.source, edge.target)
        if nx.is_connected(network) and not nx.has_bridges(network):
            edge.is_accessible = False
            remaining -= 1
        else:
            network.add_edge(edge.source, edge.target)


def is_seeded(session: Session) -> bool:
    return session.scalars(select(m.ZoneRow).limit(1)).first() is not None


def seed_database(session: Session) -> None:
    """Insert demo data (idempotent: does nothing when zones already exist)."""
    if is_seeded(session):
        return
    session.add_all(m.ZoneRow(id=z.id, name=z.name, lat=z.lat, lng=z.lng) for z in ZONES)
    session.flush()  # zones first: other tables reference them
    for name, kind, lat, lng, capacity, occupancy, reserve in ASSEMBLY_POINTS:
        zone = nearest(ZONES, GeoPoint(lat, lng), lambda z: z.position)
        session.add(
            m.AssemblyPointRow(
                name=name, kind=kind, lat=lat, lng=lng, capacity=capacity, occupancy=occupancy,
                is_active=not reserve, is_reserve=reserve, zone_id=zone.id,
                is_accessible=name not in INACCESSIBLE_POINTS,
            )
        )
    for name, status, lat, lng, target in BRIGADES:
        session.add(
            m.BrigadeRow(
                name=name, status=status, lat=lat, lng=lng,
                target_lat=target[0] if target else None,
                target_lng=target[1] if target else None,
                route=[[lat, lng], list(target)] if target else [],
            )
        )
    graph = load_road_graph()
    # Core bulk inserts: thousands of rows, so skip per-object ORM overhead.
    session.execute(insert(m.RoadNodeRow),
                    [{"id": n.id, "lat": n.lat, "lng": n.lng} for n in graph.nodes])
    session.execute(insert(m.RoadEdgeRow), [
        {"id": e.id, "name": e.name, "source": e.source, "target": e.target,
         "length_m": e.length_m, "is_open": True, "is_accessible": e.is_accessible,
         "kind": e.kind, "geometry": [list(p) for p in e.geometry]}
        for e in graph.edges
    ])
    session.commit()
