#!/usr/bin/env python3
"""Demo simulyatoru (komanda sətri).

Yalnız standart kitabxanadan istifadə edir: istənilən Python 3.9+ ilə işləyir.

Nümunələr:
  python scripts/simulate.py scenario                      # «Zəlzələ ssenarisi» (~2 dəq)
  python scripts/simulate.py sos --zone yasamal --count 4  # Qayda A-nı işə salır
  python scripts/simulate.py sos --zone nizami --count 1 --priority   # Prioritet №1 SOS
  python scripts/simulate.py occupancy --point 2 --to 96   # 90%, sonra 95% həddini keçir
  python scripts/simulate.py roads --close 3               # 3 təsadüfi yolu bağlayır
  python scripts/simulate.py roads --open-all
  python scripts/simulate.py reset

Mühit dəyişənləri: API_URL (standart http://localhost:8000), OPERATOR_TOKEN.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent


def load_dotenv() -> None:
    """Layihə kökündəki .env faylından çatışmayan dəyişənləri oxuyur."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class Api:
    def __init__(self, base_url: str, token: str) -> None:
        self.base = base_url.rstrip("/") + "/api/v1"
        self.token = token

    def call(self, method: str, path: str, body: Any = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method)
        request.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            try:
                detail = json.loads(detail)["error"]["message"]
            except (ValueError, KeyError, TypeError):
                pass
            sys.exit(f"Xəta {exc.code}: {detail}")
        except urllib.error.URLError as exc:
            sys.exit(f"Serverə qoşulmaq olmadı ({self.base}): {exc.reason}")


def cmd_sos(api: Api, args: argparse.Namespace) -> None:
    body = {"zone_id": args.zone, "count": args.count, "hazard_type": args.hazard,
            "role": "mobility_impaired" if args.priority else None}
    created = api.call("POST", "/sim/sos", body)
    for sos in created:
        mark = " · PRİORİTET №1" if sos["priority"] == 1 else ""
        print(f"SOS №{sos['id']}: {sos['zone_id']} · {sos['hazard_type']} "
              f"({sos['lat']:.4f}, {sos['lng']:.4f}){mark}")
    alerts = api.call("GET", "/alerts?status=open")
    print(f"→ {len(created)} SOS yaradıldı. Açıq həyəcan sayı: {len(alerts)}")


def cmd_occupancy(api: Api, args: argparse.Namespace) -> None:
    points = {p["id"]: p for p in api.call("GET", "/assembly-points")}
    if args.point not in points:
        listing = ", ".join(f"{p['id']}={p['name']}" for p in points.values())
        sys.exit(f"Nöqtə tapılmadı. Mövcud nöqtələr: {listing}")
    point = points[args.point]
    pct = point["occupancy_pct"]
    print(f"«{point['name']}»: {pct:.1f}% → {args.to}% (addım {args.step}%)")
    while pct < args.to:
        pct = min(args.to, pct + args.step)
        point = api.call("POST", f"/sim/assembly-points/{args.point}/occupancy",
                         {"occupancy_pct": pct})
        note = ""
        if point["occupancy_pct"] > 95:
            note = "  ← >95%: QIRMIZI həyəcan (Qayda B)"
        elif point["occupancy_pct"] >= 90:
            note = "  ← ≥90%: vətəndaşlar yenidən yönləndirilir"
        print(f"  {point['occupancy_pct']:.1f}%{note}")
        if pct < args.to:
            time.sleep(args.interval)


def cmd_roads(api: Api, args: argparse.Namespace) -> None:
    if args.open_all:
        edges = api.call("POST", "/sim/roads/open-all")
    elif args.edge:
        action = "open" if args.open is not None else "close"
        edges = [api.call("POST", f"/sim/roads/{args.edge}/{action}")]
    elif args.close:
        edges = api.call("POST", "/sim/roads/random", {"action": "close", "count": args.close})
    elif args.open:
        edges = api.call("POST", "/sim/roads/random", {"action": "open", "count": args.open})
    else:
        roads = api.call("GET", "/roads")
        closed = [e for e in roads["edges"] if not e["is_open"]]
        print(f"Cəmi {len(roads['edges'])} yol, bağlı: {len(closed)}")
        edges = closed
    for edge in edges:
        print(f"{edge['id']} ({edge['name']}): {'açıq' if edge['is_open'] else 'BAĞLI'}")


def cmd_scenario(api: Api, args: argparse.Namespace) -> None:
    body = {"speed": args.speed, "reset": not args.no_reset}
    status = api.call("POST", f"/sim/scenario/{args.name}", body)
    print(f"Ssenari başladı: {status['message']} ({status['total']} addım)")
    print("Dispetçer panelində QIRMIZI həyəcanları «Təsdiqlə» düyməsi ilə təsdiqləyin.\n")
    last = None
    while True:
        status = api.call("GET", "/sim/scenario")
        current = (status["step"], status["message"])
        if current != last and status["step"] > 0:
            print(f"[{status['step']}/{status['total']}] {status['message']}")
            last = current
        if not status["running"]:
            break
        time.sleep(1)
    alerts = api.call("GET", "/alerts")
    print(f"\nBitdi. Yaranan həyəcanlar: {len(alerts)}")
    for alert in reversed(alerts):
        print(f"  №{alert['id']} {alert['rule_id']} [{alert['status']}]")


def cmd_reset(api: Api, args: argparse.Namespace) -> None:
    api.call("POST", "/sim/reset")
    print("Sistem ilkin vəziyyətə qaytarıldı.")


def cmd_status(api: Api, args: argparse.Namespace) -> None:
    snapshot = api.call("GET", "/dashboard/snapshot")
    stats = snapshot["stats"]
    print(f"Açıq SOS: {stats['open_sos']} | Açıq həyəcan: {len(snapshot['alerts'])} | "
          f"Bağlı yol: {stats['closed_roads']} | Təhlükəsiz: {stats['safe_citizens']}")
    for zone, count in sorted(snapshot["sos_by_zone"].items()):
        print(f"  {zone}: {count} SOS")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evakuasiya sistemi üçün demo simulyatoru")
    parser.add_argument("--api-url", default=os.getenv("API_URL", "http://localhost:8000"))
    parser.add_argument("--token", default=os.getenv("OPERATOR_TOKEN", "demo-operator-token"))
    sub = parser.add_subparsers(dest="command", required=True)

    sos = sub.add_parser("sos", help="zonada təsadüfi SOS siqnalları yarat")
    sos.add_argument("--zone", default="yasamal")
    sos.add_argument("--count", type=int, default=4)
    sos.add_argument("--hazard", choices=["fire", "collapse", "flood", "medical"])
    sos.add_argument("--priority", action="store_true",
                     help="hərəkət məhdudiyyətli vətəndaşdan Prioritet №1 SOS")
    sos.set_defaults(run=cmd_sos)

    occupancy = sub.add_parser("occupancy", help="toplanış nöqtəsinin doluluğunu addım-addım artır")
    occupancy.add_argument("--point", type=int, required=True)
    occupancy.add_argument("--to", type=float, default=96.0)
    occupancy.add_argument("--step", type=float, default=5.0)
    occupancy.add_argument("--interval", type=float, default=2.0)
    occupancy.set_defaults(run=cmd_occupancy)

    roads = sub.add_parser("roads", help="yolları bağla / aç")
    roads.add_argument("--close", type=int, nargs="?", const=1, help="N təsadüfi yolu bağla")
    roads.add_argument("--open", type=int, nargs="?", const=1, help="N təsadüfi yolu aç")
    roads.add_argument("--edge", help="konkret yol (məs. e010); --close və ya --open ilə")
    roads.add_argument("--open-all", action="store_true")
    roads.set_defaults(run=cmd_roads)

    scenario = sub.add_parser("scenario", help="tam ssenarini icra et")
    scenario.add_argument("name", nargs="?", default="earthquake")
    scenario.add_argument("--speed", type=float, default=1.0, help="2 = iki dəfə sürətli")
    scenario.add_argument("--no-reset", action="store_true")
    scenario.set_defaults(run=cmd_scenario)

    sub.add_parser("reset", help="sistemi sıfırla").set_defaults(run=cmd_reset)
    sub.add_parser("status", help="cari vəziyyət").set_defaults(run=cmd_status)
    return parser


def main() -> None:
    load_dotenv()
    args = build_parser().parse_args()
    args.run(Api(args.api_url, args.token), args)


if __name__ == "__main__":
    main()
