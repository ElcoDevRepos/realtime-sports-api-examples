#!/usr/bin/env python3
"""NBA data in Python with the Realtime Sports API: scores, box scores and play-by-play.

Usage:
  python nba.py scores                      # today's scoreboard
  python nba.py scores --date 2026-11-04    # any day
  python nba.py box <eventId>               # points, rebounds, assists and shooting for every player
  python nba.py plays <eventId>             # the last plays of a game (--all for every page)

Each command is one API call (plays --all pages through the game). Needs REALTIME_SPORTS_API_KEY (env or .env).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")
NBA = "/sports/basketball/leagues/nba"


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


def cmd_scores(args: argparse.Namespace) -> None:
    params = {"date": args.date} if args.date else {}
    print_games(api_get(f"{NBA}/events", **params)["data"])


def cmd_box(args: argparse.Namespace) -> None:
    box = api_get(f"{NBA}/events/{args.event_id}/boxscore")["data"] or {}
    for side in ("away", "home"):
        team = box.get(f"{side}Team") or {}
        print(f"\n{team.get('name', side)} {team.get('score', '')}")
        for p in box.get(f"{side}Players") or []:
            if p.get("didNotPlay"):
                continue
            print(f"  {p.get('name'):<24} {p.get('minutes', '-'):>3} min  {p.get('points', '0'):>3} pts  {p.get('rebounds', '0'):>2} reb  {p.get('assists', '0'):>2} ast  FG {p.get('fieldGoalsMade-fieldGoalsAttempted', '-')}  3PT {p.get('threePointFieldGoalsMade-threePointFieldGoalsAttempted', '-')}")


def cmd_plays(args: argparse.Namespace) -> None:
    path = f"{NBA}/events/{args.event_id}/plays"
    first = api_get(path, page=1, limit=100)
    pages = first["meta"]["pagination"]["totalPages"]
    plays = list(first["data"])
    if args.all:
        for page in range(2, pages + 1):
            plays += api_get(path, page=page, limit=100)["data"]
    elif pages > 1:
        plays = api_get(path, page=pages, limit=100)["data"]
    for p in plays[-args.last:] if not args.all else plays:
        clock = (p.get("clock") or {}).get("displayValue", "")
        print(f"Q{p.get('period')} {clock:>5}  {p.get('awayScore')}-{p.get('homeScore')}  {p.get('text')}")


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scores"); s.add_argument("--date"); s.set_defaults(fn=cmd_scores)
    b = sub.add_parser("box"); b.add_argument("event_id"); b.set_defaults(fn=cmd_box)
    p = sub.add_parser("plays"); p.add_argument("event_id"); p.add_argument("--all", action="store_true"); p.add_argument("--last", type=int, default=15); p.set_defaults(fn=cmd_plays)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
