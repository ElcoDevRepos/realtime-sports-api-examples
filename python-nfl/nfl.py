#!/usr/bin/env python3
"""NFL data in Python with the Realtime Sports API: scores, box scores and injury reports.

Usage:
  python nfl.py scores                         # this week's games (current scoreboard)
  python nfl.py scores --season 2026 --week 8  # any regular-season week
  python nfl.py box <eventId>                  # passing, rushing and receiving lines for one game
  python nfl.py injuries                       # league-wide injury report (latest 25 per team)
  python nfl.py injuries --team 9              # one team's full report (team ids: `scores` prints them)

Each command is one API call. Needs REALTIME_SPORTS_API_KEY (env or .env).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")
NFL = "/sports/football/leagues/nfl"


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
    return f"{t.get('abbreviation') or t.get('name')} (id {t.get('id')}){'' if score is None else f' {score}'}"


def cmd_scores(args: argparse.Namespace) -> None:
    if args.week:
        body = api_get(f"{NFL}/seasons/{args.season}/schedule", week=args.week, seasonType=2)
    else:
        body = api_get(f"{NFL}/events", limit=50)
    for g in sorted(body["data"], key=lambda e: e.get("date") or ""):
        status = (g.get("status") or {}).get("detail") or (g.get("status") or {}).get("state")
        print(f"[{g['id']}] {g.get('date', '')[:16]}  {team_line(g['awayTeam'])} @ {team_line(g['homeTeam'])}  {status}")


def cmd_box(args: argparse.Namespace) -> None:
    box = api_get(f"{NFL}/events/{args.event_id}/boxscore")["data"] or {}
    for side in ("away", "home"):
        team = box.get(f"{side}Team") or {}
        print(f"\n{team.get('name', side)} {team.get('score', '')}")
        for p in box.get(f"{side}Players") or []:
            c = p.get("categories") or {}
            parts = []
            if "passing" in c:
                ps = c["passing"]
                parts.append(f"{ps.get('completions/passingAttempts')} for {ps.get('passingYards')} yds, {ps.get('passingTouchdowns')} TD, {ps.get('interceptions')} INT")
            if "rushing" in c:
                rs = c["rushing"]
                parts.append(f"{rs.get('rushingAttempts')} rush, {rs.get('rushingYards')} yds, {rs.get('rushingTouchdowns')} TD")
            if "receiving" in c:
                rc = c["receiving"]
                parts.append(f"{rc.get('receptions')} rec, {rc.get('receivingYards')} yds, {rc.get('receivingTouchdowns')} TD")
            if parts:
                print(f"  {p.get('name')}: " + "; ".join(parts))


def cmd_injuries(args: argparse.Namespace) -> None:
    params = {"team": args.team} if args.team else {}
    data = api_get(f"{NFL}/injuries", **params)["data"] or {}
    for group in data.get("groups") or []:
        rows = group.get("injuries") or []
        if not rows:
            continue
        # The league-wide feed names each team; a ?team= report carries only the team id.
        t = rows[0].get("team") or group.get("team") or {}
        team = t.get("displayName") or f"Team {t.get('id', '?')}"
        print(f"\n{team} ({len(rows)})")
        for i in rows:
            ath = i.get("athlete") or {}
            ret = f", expected back {i['returnDate']}" if i.get("returnDate") else ""
            print(f"  {ath.get('displayName')} ({ath.get('position')}): {i.get('status')} - {i.get('bodyPart') or i.get('type')}{ret}")
    print(f"\n{data.get('count', 0)} records")


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scores")
    s.add_argument("--season", type=int, default=2026)
    s.add_argument("--week", type=int)
    s.set_defaults(fn=cmd_scores)
    b = sub.add_parser("box")
    b.add_argument("event_id")
    b.set_defaults(fn=cmd_box)
    i = sub.add_parser("injuries")
    i.add_argument("--team")
    i.set_defaults(fn=cmd_injuries)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
