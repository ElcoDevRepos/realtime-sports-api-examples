#!/usr/bin/env python3
"""Soccer (football) data in Python with the Realtime Sports API: fixtures and scores for many leagues.

Usage:
  python soccer.py scores                          # Premier League scoreboard
  python soccer.py scores --league esp.1           # LaLiga (usa.1 = MLS, eng.1 = Premier League ...)
  python soccer.py scores --league usa.1 --date 2026-11-01
  python soccer.py leagues                         # the league codes

One key covers every league. Needs REALTIME_SPORTS_API_KEY (env or .env).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")


def load_dotenv(path: Path) -> None:
    """Tiny .env loader (KEY=value). Existing environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def api_get(path: str, **params: Any) -> Dict[str, Any]:
    key = os.environ.get("REALTIME_SPORTS_API_KEY")
    if not key:
        sys.exit("Set REALTIME_SPORTS_API_KEY (get a free key at https://www.realtimesportsapi.com/signup)")
    r = requests.get(f"{API_BASE}{path}", params=params, headers={"Authorization": f"Bearer {key}"}, timeout=20)
    body = r.json()
    if r.status_code != 200 or not body.get("success", False):
        err = body.get("error") or {}
        sys.exit(f"HTTP {r.status_code}: {err.get('message') or body}")
    return body


def team_line(t: Dict[str, Any]) -> str:
    score = t.get("score")
    return f"{t.get('abbreviation') or t.get('name')}{'' if score is None else f' {score}'}"


def print_games(games) -> None:
    for g in sorted(games, key=lambda e: e.get("date") or ""):
        st = g.get("status") or {}
        print(f"[{g['id']}] {g.get('date', '')[:16]}  {team_line(g['awayTeam'])} @ {team_line(g['homeTeam'])}  {st.get('detail') or st.get('state')}")


LEAGUES = {
    "eng.1": "Premier League", "esp.1": "LaLiga", "ita.1": "Serie A", "ger.1": "Bundesliga",
    "fra.1": "Ligue 1", "usa.1": "MLS", "mex.1": "Liga MX", "uefa.champions": "Champions League",
}


def cmd_scores(args: argparse.Namespace) -> None:
    params = {"date": args.date} if args.date else {}
    print_games(api_get(f"/sports/soccer/leagues/{args.league}/events", **params)["data"])


def cmd_leagues(args: argparse.Namespace) -> None:
    for code, name in LEAGUES.items():
        print(f"{code:<16} {name}")


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scores"); s.add_argument("--league", default="eng.1"); s.add_argument("--date"); s.set_defaults(fn=cmd_scores)
    l = sub.add_parser("leagues"); l.set_defaults(fn=cmd_leagues)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
