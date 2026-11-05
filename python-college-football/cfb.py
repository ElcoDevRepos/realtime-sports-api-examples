#!/usr/bin/env python3
"""College football (NCAA FBS) data in Python with the Realtime Sports API: scores, box scores and play-by-play.

Usage:
  python cfb.py scores                          # the current scoreboard (this week's games)
  python cfb.py scores --date 2026-10-31        # one day's games (Saturdays are big: use --team to filter)
  python cfb.py scores --date 2026-10-31 --team UGA
  python cfb.py box <eventId>                   # passing, rushing and receiving lines for one game
  python cfb.py plays <eventId> --last 15       # the last plays of a game, with the score after each

Each command is one API call (plays: two when the game has more than 100 plays; --all fetches every page). Needs REALTIME_SPORTS_API_KEY (env or .env).
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


def team_line(t: Dict[str, Any], show_score: bool = True) -> str:
    score = t.get("score") if show_score else None
    return f"{t.get('abbreviation') or t.get('name')}{'' if score is None else f' {score}'}"


def cmd_scores(args: argparse.Namespace) -> None:
    params: Dict[str, Any] = {"limit": 200}
    if args.date:
        params["date"] = args.date
    games: List[Dict[str, Any]] = api_get(f"{CFB}/events", **params)["data"]
    if args.team:
        want = args.team.upper()
        games = [g for g in games if want in ((g["awayTeam"].get("abbreviation") or "").upper(), (g["homeTeam"].get("abbreviation") or "").upper())]
    for g in sorted(games, key=lambda e: e.get("date") or ""):
        st = g.get("status") or {}
        started = st.get("state") != "pre"  # no 0-0 for games that haven't kicked off
        print(f"[{g['id']}] {team_line(g['awayTeam'], started)} @ {team_line(g['homeTeam'], started)}  {st.get('detail') or st.get('state')}")
    print(f"\n{len(games)} games")


def cmd_box(args: argparse.Namespace) -> None:
    box = api_get(f"{CFB}/events/{args.event_id}/boxscore")["data"] or {}
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


def cmd_plays(args: argparse.Namespace) -> None:
    """Plays come oldest first, 100 per page. Default: the game's last page (the end of the game, or the
    latest plays if it is live). --all walks every page."""
    path = f"{CFB}/events/{args.event_id}/plays"
    first = api_get(path, limit=100, page=1)
    pg = (first.get("meta") or {}).get("pagination") or {}
    pages = pg.get("totalPages") or 1
    plays: List[Dict[str, Any]] = list(first["data"] or [])
    if args.all:
        for page in range(2, pages + 1):
            plays.extend(api_get(path, limit=100, page=page)["data"] or [])
    elif pages > 1:
        plays = list(api_get(path, limit=100, page=pages)["data"] or [])
    for p in plays[-args.last:] if args.last else plays:
        period = (p.get("period") or {}).get("number") if isinstance(p.get("period"), dict) else p.get("period")
        clock = (p.get("clock") or {}).get("displayValue") if isinstance(p.get("clock"), dict) else (p.get("clock") or "")
        score = f"{p.get('awayScore', '')}-{p.get('homeScore', '')}"
        print(f"Q{period} {clock or '':>5}  {score:>7}  {p.get('text', '')}")
    print(f"\n{pg.get('total', len(plays))} plays in the game")


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scores")
    s.add_argument("--date", help="YYYY-MM-DD, one US Eastern day (default: the current scoreboard)")
    s.add_argument("--team", help="filter by team abbreviation, e.g. UGA")
    s.set_defaults(fn=cmd_scores)
    b = sub.add_parser("box")
    b.add_argument("event_id")
    b.set_defaults(fn=cmd_box)
    pl = sub.add_parser("plays")
    pl.add_argument("event_id")
    pl.add_argument("--last", type=int, default=15, help="show only the last N plays (0 = all fetched)")
    pl.add_argument("--all", action="store_true", help="fetch every page, not just the first 100 plays")
    pl.set_defaults(fn=cmd_plays)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
