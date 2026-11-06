#!/usr/bin/env python3
"""NHL data in Python with the Realtime Sports API: scores, goals and injury reports.

Usage:
  python nhl.py scores                      # today's scoreboard
  python nhl.py scores --date 2026-11-04    # any day
  python nhl.py goals <eventId>             # every goal in a game, with the score after it
  python nhl.py injuries [--team <id>]      # injury report, league-wide or one team

Needs REALTIME_SPORTS_API_KEY (env or .env). For goal alerts pushed to you, see the nhl-goal-alerts example.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")
NHL = "/sports/hockey/leagues/nhl"


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
    print_games(api_get(f"{NHL}/events", **params)["data"])


def cmd_goals(args: argparse.Namespace) -> None:
    path = f"{NHL}/events/{args.event_id}/plays"
    first = api_get(path, page=1, limit=100)
    plays = list(first["data"])
    for page in range(2, first["meta"]["pagination"]["totalPages"] + 1):
        plays += api_get(path, page=page, limit=100)["data"]
    goals = [p for p in plays if p.get("scoringPlay")]
    for p in goals:
        clock = (p.get("clock") or {}).get("displayValue", "")
        print(f"P{p.get('period')} {clock:>5}  {p.get('awayScore')}-{p.get('homeScore')}  {p.get('text')}")
    print(f"\n{len(goals)} goals")


def cmd_injuries(args: argparse.Namespace) -> None:
    params = {"team": args.team} if args.team else {}
    data = api_get(f"{NHL}/injuries", **params)["data"] or {}
    for group in data.get("groups") or []:
        rows = group.get("injuries") or []
        if not rows:
            continue
        t = rows[0].get("team") or group.get("team") or {}
        print(f"\n{t.get('displayName') or 'Team ' + str(t.get('id', '?'))} ({len(rows)})")
        for i in rows:
            ath = i.get("athlete") or {}
            print(f"  {ath.get('displayName')} ({ath.get('position')}): {i.get('status')}")
    print(f"\n{data.get('count', 0)} records")


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scores"); s.add_argument("--date"); s.set_defaults(fn=cmd_scores)
    g = sub.add_parser("goals"); g.add_argument("event_id"); g.set_defaults(fn=cmd_goals)
    i = sub.add_parser("injuries"); i.add_argument("--team"); i.set_defaults(fn=cmd_injuries)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
