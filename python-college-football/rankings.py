#!/usr/bin/env python3
"""College football rankings in Python with the Realtime Sports API: the AP Top 25, coaches poll or
College Football Playoff rankings, the week's biggest movers, and this week's ranked matchups.

Usage:
  python rankings.py                    # AP Top 25, latest release
  python rankings.py --poll cfp         # CFP rankings (or: coaches)
  python rankings.py movers             # who moved most since the previous week (AP)
  python rankings.py matchups           # this week's games with a ranked team, "#2 UGA @ #10 MISS"

Needs REALTIME_SPORTS_API_KEY (env or .env). `movers` makes two calls, the others one each.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")
CFB = "/sports/football/leagues/college-football"


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


def poll(name: str, week: int | None = None) -> Dict[str, Any]:
    params: Dict[str, Any] = {"poll": name}
    if week:
        params["week"] = week
    polls: List[Dict[str, Any]] = api_get(f"{CFB}/rankings", **params)["data"]
    if not polls:
        sys.exit(f"No {name} poll for that week")
    return polls[0]


def cmd_show(args: argparse.Namespace) -> None:
    p = poll(args.poll)
    print(f"{p['name']} - {p['week'].get('label') or ''} ({(p.get('date') or '')[:10]})")
    for r in p["ranks"]:
        t = r["team"]
        votes = f", {r['firstPlaceVotes']} first-place" if r.get("firstPlaceVotes") else ""
        pts = f", {r['points']:g} pts" if r.get("points") else ""
        print(f"  {r['rank']:>2}. {t.get('displayName')} ({r.get('record') or '-'}){pts}{votes}")
    if p.get("othersReceivingVotes"):
        print("  Others receiving votes: " + ", ".join(f"{o['team'].get('abbreviation')} {o.get('points') or 0:g}" for o in p["othersReceivingVotes"]))


def cmd_movers(args: argparse.Namespace) -> None:
    now = poll(args.poll)
    week = now["week"].get("number")
    if not week or week < 2:
        sys.exit("No previous week to compare with yet")
    before = {r["team"]["id"]: r["rank"] for r in poll(args.poll, week - 1)["ranks"]}
    moved = [(before[r["team"]["id"]] - r["rank"], r) for r in now["ranks"] if r["team"]["id"] in before]
    print(f"{now['name']}: Week {week - 1} -> Week {week}")
    for delta, r in sorted(moved, key=lambda m: -abs(m[0]))[:6]:
        if delta:
            print(f"  #{r['rank']:>2} {r['team'].get('displayName')}: {'+' if delta > 0 else ''}{delta} (was #{before[r['team']['id']]})")
    for r in now["ranks"]:
        if r["team"]["id"] not in before:
            print(f"  new at #{r['rank']}: {r['team'].get('displayName')}")
    for d in now.get("droppedOut") or []:
        print(f"  dropped out: {d['team'].get('displayName')} (was #{d.get('previousRank')})")


def cmd_matchups(args: argparse.Namespace) -> None:
    games = api_get(f"{CFB}/events", limit=200)["data"]
    tag = lambda t: f"#{t['rank']} {t.get('abbreviation')}" if t.get("rank") else t.get("abbreviation")
    ranked = [g for g in games if g["homeTeam"].get("rank") or g["awayTeam"].get("rank")]
    for g in sorted(ranked, key=lambda g: g.get("date") or ""):
        st = g.get("status") or {}
        score = "" if st.get("state") == "pre" else f"  {g['awayTeam'].get('score')}-{g['homeTeam'].get('score')}"
        print(f"[{g['id']}] {tag(g['awayTeam'])} @ {tag(g['homeTeam'])}{score}  {st.get('detail') or ''}")
    print(f"\n{len(ranked)} of {len(games)} games involve a ranked team (rank = the ranking the scoreboard shows for each team)")


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--poll", default="ap", choices=["ap", "coaches", "cfp"])
    ap.add_argument("cmd", nargs="?", default="show", choices=["show", "movers", "matchups"])
    args = ap.parse_args()
    {"show": cmd_show, "movers": cmd_movers, "matchups": cmd_matchups}[args.cmd](args)


if __name__ == "__main__":
    main()
