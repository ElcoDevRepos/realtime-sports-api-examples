#!/usr/bin/env python3
"""Men's college basketball scoreboard, close-game watcher and NCAA tournament bracket.

Python 3.9+, standard library only.

  python cbb.py scoreboard [--teams DUKE,UNC]      today's scoreboard (one call)
  python cbb.py watch [--teams ...] [--margin 5]   poll live games; flag close finishes and finals
  python cbb.py bracket [--season 2026] [--csv out.csv]   NCAA tournament games by round and region
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from cbb_lib import LEAGUE_PATH, ApiError, api_get, bracket_rows, game_line, idle_seconds, involves, is_close, load_dotenv, render_bracket

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
load_dotenv(HERE.parent / ".env")


def key() -> str:
    k = os.environ.get("REALTIME_SPORTS_API_KEY", "")
    if not k or k == "your_api_key_here":
        sys.exit("Set REALTIME_SPORTS_API_KEY (see .env.example). Free key: https://www.realtimesportsapi.com/signup")
    return k


def teams_arg(s: str | None) -> list[str]:
    return [t.strip() for t in (s or os.environ.get("TEAMS", "")).split(",") if t.strip()]


def scoreboard(args) -> None:
    games = [g for g in api_get(f"{LEAGUE_PATH}/events", key(), limit=args.limit)["data"] if involves(g, teams_arg(args.teams))]
    if not games:
        print("No games on the current scoreboard" + (" for those teams." if args.teams else "."))
    order = {"in": 0, "pre": 1, "post": 2}
    for g in sorted(games, key=lambda g: (order.get((g.get("status") or {}).get("state"), 3), g.get("date") or "")):
        print(game_line(g))


def watch(args) -> None:
    k, teams = key(), teams_arg(args.teams)
    seen_close: set[str] = set()
    last: dict[str, dict] = {}
    poll = max(30, args.poll)
    print(f"Watching men's college basketball{' (' + ', '.join(teams) + ')' if teams else ''} every {poll}s", file=sys.stderr)
    while True:
        try:
            live = [g for g in api_get(f"{LEAGUE_PATH}/events/live", k)["data"] if involves(g, teams)]
            now_ids = {g["id"] for g in live}
            for g in live:
                if is_close(g, args.margin) and g["id"] not in seen_close:
                    seen_close.add(g["id"])
                    print(f"🔥 Close game: {game_line(g)}", flush=True)
                last[g["id"]] = g
            for gone in [i for i in last if i not in now_ids]:
                final = api_get(f"{LEAGUE_PATH}/events/{gone}", k)["data"]  # one call per finished game
                print(f"🏁 Final: {game_line(final)}", flush=True)
                del last[gone]
            if live:
                time.sleep(poll)
                continue
            # Nothing live: one scoreboard call, then sleep until shortly before the next tip-off.
            events = [g for g in api_get(f"{LEAGUE_PATH}/events", k)["data"] if involves(g, teams)]
            wait = idle_seconds(events, time.time(), default=args.idle * 60)
            print(f"Nothing live; next check in {wait // 60} min", file=sys.stderr)
            time.sleep(wait)
        except ApiError as e:
            if e.status == 401:
                sys.exit(str(e))
            wait = min(e.retry_after or 3600, 6 * 3600) if e.status == 429 else poll
            print(f"{e}; retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
        except KeyboardInterrupt:
            return


def bracket(args) -> None:
    games = api_get(f"{LEAGUE_PATH}/seasons/{args.season}/tournament", key())["data"]
    if not games:
        print(f"No NCAA tournament games for {args.season} yet (Selection Sunday is in mid-March).")
        return
    print(render_bracket(games))
    if args.csv:
        rows = bracket_rows(games)
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"\nWrote {len(rows)} games to {args.csv}", file=sys.stderr)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scoreboard")
    s.add_argument("--teams", help="comma-separated abbreviations or team ids (default: TEAMS env)")
    s.add_argument("--limit", type=int, default=50, help="max games from the scoreboard window (default 50)")
    s.set_defaults(fn=scoreboard)
    w = sub.add_parser("watch")
    w.add_argument("--teams")
    w.add_argument("--margin", type=int, default=5, help="points that count as close (default 5)")
    w.add_argument("--poll", type=int, default=60, help="seconds between polls while live (min 30)")
    w.add_argument("--idle", type=int, default=30, help="minutes between checks when nothing is live and no start time is known")
    w.set_defaults(fn=watch)
    b = sub.add_parser("bracket")
    b.add_argument("--season", type=int, default=datetime.now(timezone.utc).year if datetime.now(timezone.utc).month <= 6 else datetime.now(timezone.utc).year + 1,
                   help="season year = the year the tournament is played (default: the coming one)")
    b.add_argument("--csv", help="also write the games to this CSV file")
    b.set_defaults(fn=bracket)
    args = p.parse_args()
    try:
        args.fn(args)
    except ApiError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
