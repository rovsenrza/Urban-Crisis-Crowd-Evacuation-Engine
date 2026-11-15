#!/usr/bin/env python3
"""Real yol şəbəkəsini OpenStreetMap-dən qurur.

Bakının küçələrini Overpass API-dən yükləyir, kəsişmələr arasında tillərə
bölür və `backend/app/adapters/db/data/baku_roads.json` faylına yazır.
Backend bu faylı seed zamanı oxuyur; iş vaxtı internet lazım deyil.

İstifadə:
  python3 scripts/build_road_graph.py                 # yüklə və qur
  python3 scripts/build_road_graph.py --raw raw.json  # əvvəl yüklənmiş cavabdan qur

Məlumat © OpenStreetMap töhfəçiləri, ODbL lisenziyası.
Yalnız standart kitabxana; `networkx` tələb olunmur.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "backend" / "app" / "adapters" / "db" / "data" / "baku_roads.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# south, west, north, east: bütün demo zonalarını əhatə edir
BBOX = (40.33, 49.77, 40.47, 49.98)
# Həyət yolları (living_street) bilərəkdən daxil edilmir: şəbəkəni üç dəfə
# böyüdür, marşrutun görünüşünə isə az təsir edir.
HIGHWAYS = [
    "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "pedestrian",
    "trunk_link", "primary_link", "secondary_link", "tertiary_link",
]
RANK = {"trunk": 0, "primary": 1, "secondary": 2, "tertiary": 3, "unclassified": 4,
        "residential": 5, "pedestrian": 6}
MAJOR = {"trunk", "primary", "secondary", "tertiary"}
INACCESSIBLE_SHARE = 0.2
EARTH_RADIUS_M = 6_371_000.0


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    phi1, phi2 = math.radians(a[0]), math.radians(b[0])
    d_phi, d_lambda = phi2 - phi1, math.radians(b[1] - a[1])
    h = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def download() -> dict:
    classes = "|".join(HIGHWAYS)
    south, west, north, east = BBOX
    query = (
        f'[out:json][timeout:120];'
        f'way["highway"~"^({classes})$"]({south},{west},{north},{east});'
        f'out geom tags;'
    )
    data = urllib.parse.urlencode({"data": query}).encode()
    request = urllib.request.Request(OVERPASS_URL, data=data,
                                     headers={"User-Agent": "evac-engine-demo-builder"})
    print("Overpass API-dən yüklənir…", file=sys.stderr)
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read())


def build(raw: dict, classes: set[str]) -> dict:
    ways = []
    for element in raw["elements"]:
        tags = element.get("tags", {})
        if (element["type"] != "way" or tags.get("highway") not in classes
                or tags.get("access") in ("private", "no") or len(element.get("geometry", [])) < 2):
            continue
        # Düyün = koordinat (7 onluq rəqəm ≈ 1 sm): OSM-də kəsişən yollar eyni
        # nöqtəni paylaşır, ona görə ayrıca düyün identifikatoru lazım deyil.
        element["nodes"] = [(round(p["lat"], 7), round(p["lon"], 7)) for p in element["geometry"]]
        ways.append(element)

    # Kəsişmə = iki və daha çox yolda işlənən düyün və ya yolun ucu.
    usage: dict[tuple[float, float], int] = defaultdict(int)
    position: dict[tuple[float, float], tuple[float, float]] = {}
    for way in ways:
        for node in way["nodes"]:
            usage[node] += 1
            position[node] = (round(node[0], 6), round(node[1], 6))
        usage[way["nodes"][0]] += 1
        usage[way["nodes"][-1]] += 1

    edges = []
    for way in ways:
        tags = way["tags"]
        name = tags.get("name:az") or tags.get("name") or ""
        start = 0
        nodes = way["nodes"]
        for index in range(1, len(nodes)):
            if usage[nodes[index]] < 2 and index != len(nodes) - 1:
                continue
            segment = nodes[start:index + 1]
            start = index
            if segment[0] == segment[-1]:
                continue  # ilmə
            geometry = [position[n] for n in segment]
            length = sum(haversine_m(a, b) for a, b in zip(geometry, geometry[1:]))
            if length < 1:
                continue
            edges.append({"s": segment[0], "t": segment[-1], "len": round(length, 1),
                          "name": name, "kind": tags["highway"].replace("_link", ""),
                          "geom": geometry})

    edges = largest_component(edges)
    edges = merge_chains(edges)
    edges = split_parallel(edges, position)
    mark_inaccessible(edges)

    # Yığcam, sabit identifikatorlar.
    node_ids: dict = {}
    for edge in edges:
        for key in ("s", "t"):
            node_ids.setdefault(edge[key], f"n{len(node_ids) + 1}")
    width = len(str(len(edges)))
    return {
        "source": "OpenStreetMap (ODbL) via Overpass API",
        "bbox": BBOX,
        "nodes": {node_ids[osm]: list(position[osm]) for osm in node_ids},
        "edges": [
            {"id": f"e{number:0{max(3, width)}d}", "s": node_ids[e["s"]], "t": node_ids[e["t"]],
             "len": e["len"], "name": e["name"], "kind": e["kind"], "acc": e["acc"],
             "geom": [list(p) for p in e["geom"]]}
            for number, e in enumerate(edges, start=1)
        ],
    }


def merge_chains(edges: list[dict]) -> list[dict]:
    """OSM bir küçəni çoxlu qısa hissəyə bölür. Yalnız iki tilin birləşdiyi
    düyünlər (kəsişmə deyil) silinir və tillər birləşdirilir."""
    incident: dict = defaultdict(list)
    for index, edge in enumerate(edges):
        incident[edge["s"]].append(index)
        incident[edge["t"]].append(index)
    alive = [True] * len(edges)
    for node in list(incident):
        live = [i for i in incident[node] if alive[i]]
        if len(live) != 2 or live[0] == live[1]:
            continue
        first, second = edges[live[0]], edges[live[1]]
        # Hər ikisini elə çevir ki, first ...→node, node→... second olsun.
        if first["s"] == node:
            first = {**first, "s": first["t"], "t": first["s"], "geom": first["geom"][::-1]}
        if second["t"] == node:
            second = {**second, "s": second["t"], "t": second["s"], "geom": second["geom"][::-1]}
        if first["s"] == second["t"]:
            continue  # birləşmə ilmə yaradardı
        longer = first if first["len"] >= second["len"] else second
        merged = {"s": first["s"], "t": second["t"], "len": round(first["len"] + second["len"], 1),
                  "name": longer["name"] or first["name"] or second["name"],
                  "kind": min(first["kind"], second["kind"], key=lambda k: RANK.get(k, 9)),
                  "geom": first["geom"] + second["geom"][1:]}
        alive[live[0]] = alive[live[1]] = False
        edges.append(merged)
        alive.append(True)
        new_index = len(edges) - 1
        incident[merged["s"]].append(new_index)
        incident[merged["t"]].append(new_index)
    return [edge for edge, keep in zip(edges, alive) if keep]


def split_parallel(edges: list[dict], position: dict) -> list[dict]:
    """Eyni iki düyün arasında bir neçə til varsa, artıqlarını ortadan bölür ki,
    qraf sadə qalsın (hər düyün cütü arasında ən çoxu bir til)."""
    seen: set[frozenset] = set()
    result: list[dict] = []
    for edge in edges:
        pair = frozenset((edge["s"], edge["t"]))
        if pair not in seen or len(edge["geom"]) < 3:
            if pair in seen:
                continue  # düz xətli dublikat: atılır
            seen.add(pair)
            result.append(edge)
            continue
        middle = len(edge["geom"]) // 2
        node = ("split", len(result))
        position[node] = edge["geom"][middle]
        for geometry, start, end in ((edge["geom"][:middle + 1], edge["s"], node),
                                     (edge["geom"][middle:], node, edge["t"])):
            length = sum(haversine_m(a, b) for a, b in zip(geometry, geometry[1:]))
            result.append({**edge, "s": start, "t": end, "len": round(length, 1), "geom": geometry})
    return result


def adjacency(edges: list[dict]) -> dict[int, set[int]]:
    graph: dict[int, set[int]] = defaultdict(set)
    for edge in edges:
        graph[edge["s"]].add(edge["t"])
        graph[edge["t"]].add(edge["s"])
    return graph


def largest_component(edges: list[dict]) -> list[dict]:
    graph = adjacency(edges)
    seen: set[int] = set()
    best: set[int] = set()
    for start in graph:
        if start in seen:
            continue
        component, queue = {start}, deque([start])
        while queue:
            for neighbour in graph[queue.popleft()]:
                if neighbour not in component:
                    component.add(neighbour)
                    queue.append(neighbour)
        seen |= component
        if len(component) > len(best):
            best = component
    return [e for e in edges if e["s"] in best]


def connected_without(graph: dict[int, set[int]], a: int, b: int) -> bool:
    """a və b arasında a–b tilindən başqa yol varmı (ikitərəfli BFS)."""
    frontier, other = {a}, {b}
    seen_a, seen_b = {a}, {b}
    while frontier and other:
        if len(frontier) > len(other):
            frontier, other, seen_a, seen_b = other, frontier, seen_b, seen_a
        following = set()
        for node in frontier:
            for neighbour in graph[node]:
                if (node == a and neighbour == b) or (node == b and neighbour == a):
                    continue
                if neighbour in seen_b:
                    return True
                if neighbour not in seen_a:
                    seen_a.add(neighbour)
                    following.add(neighbour)
        frontier = following
    return False


def mark_inaccessible(edges: list[dict], seed: int = 7) -> None:
    """Kiçik küçələrin bir hissəsini «maneəli» işarələyir (demo fərziyyəsi).

    Til yalnız o halda işarələnir ki, maneəsiz şəbəkə bağlı qalsın. Magistral
    yollar həmişə maneəsiz sayılır.
    """
    rng = random.Random(seed)
    for edge in edges:
        edge["acc"] = True
    # Paralel tillər (eyni iki düyün arasında) üçün sayğac.
    multiplicity: dict[frozenset, int] = defaultdict(int)
    for edge in edges:
        multiplicity[frozenset((edge["s"], edge["t"]))] += 1
    graph = adjacency(edges)
    candidates = [e for e in edges if e["kind"] not in MAJOR]
    rng.shuffle(candidates)
    remaining = round(len(edges) * INACCESSIBLE_SHARE)
    for edge in candidates:
        if remaining == 0:
            break
        a, b = edge["s"], edge["t"]
        pair = frozenset((a, b))
        if multiplicity[pair] > 1:  # paralel til qalır: əlaqə itmir
            multiplicity[pair] -= 1
        elif connected_without(graph, a, b):
            graph[a].discard(b)
            graph[b].discard(a)
            multiplicity[pair] -= 1
        else:
            continue
        edge["acc"] = False
        remaining -= 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, help="əvvəl saxlanılmış Overpass cavabı")
    parser.add_argument("--save-raw", type=Path, help="yüklənən cavabı bu fayla da yaz")
    parser.add_argument("--classes", default=",".join(HIGHWAYS),
                        help="daxil ediləcək highway sinifləri (vergüllə)")
    parser.add_argument("--stats-only", action="store_true")
    args = parser.parse_args()

    raw = json.loads(args.raw.read_text()) if args.raw else download()
    if args.save_raw:
        args.save_raw.write_text(json.dumps(raw))
    graph = build(raw, set(args.classes.split(",")))
    payload = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
    blocked = sum(1 for e in graph["edges"] if not e["acc"])
    print(f"{len(graph['nodes'])} düyün, {len(graph['edges'])} til, "
          f"{blocked} maneəli, {len(payload) / 1e6:.2f} MB", file=sys.stderr)
    if not args.stats_only:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(payload, encoding="utf-8")
        print(f"Yazıldı: {OUTPUT.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
