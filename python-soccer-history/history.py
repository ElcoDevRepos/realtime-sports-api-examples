#!/usr/bin/env python3
"""Historical soccer results with the Realtime Sports API: a club's season-by-season record and
head-to-head results between two clubs, back to 2010-11 for most leagues.

Uses the historical results endpoints (on every plan, including Free). Historical data is updated
periodically and is never live: for live scores use the events endpoints.

Usage:
  python history.py seasons arsenal                       # Premier League, every season on file
  python history.py seasons barcelona --league esp.1
  python history.py h2h arsenal tottenham                 # every Premier League meeting
  python history.py h2h "manchester united" liverpool --since 2015-16 --csv h2h.csv

Team names: a slug (arsenal-fc) or the start of a name ("manchester united"). Costs one API call
for the season list, plus one per season read.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")


def load_dotenv(*paths: Path) -> None:
    """Tiny .env loader (KEY=value). Existing environment variables win."""
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def api_get(path: str, key: str, **params: Any) -> Optional[Dict[str, Any]]:
    """GET a history endpoint. Returns None on 404 (no data for that season/table)."""
    res = requests.get(
        API_BASE + path,
        params={k: v for k, v in params.items() if v is not None},
        headers={"Authorization": f"Bearer {key}"},
        timeout=30,
    )
    if res.status_code == 404:
        return None
    if not res.ok:
        try:
            err = res.json().get("error") or {}
        except ValueError:
            err = {}
        sys.exit(f"HTTP {res.status_code} {err.get('code', '')}: {err.get('message', res.text[:200])}")
    return res.json()


def seasons_on_file(league: str, key: str, since: Optional[str]) -> List[Dict[str, Any]]:
    data = api_get(f"/sports/soccer/leagues/{league}/history", key)
    if not data:
        sys.exit(f"No historical results for league {league}.")
    rows = sorted(data["data"]["seasons"], key=lambda s: s["season"])
    return [s for s in rows if not since or s["season"] >= since]


def norm(s: str) -> str:
    return s.lower().replace("-", " ").strip()


def season_by_season(team: str, league: str, key: str, since: Optional[str]) -> List[Dict[str, Any]]:
    out = []
    for s in seasons_on_file(league, key, since):
        table = api_get(f"/sports/soccer/leagues/{league}/history/{s['season']}/standings", key)
        if not table:
            print(f"  {s['season']}: no league table (cup or group competition)", file=sys.stderr)
            continue
        rows = table["data"]["standings"]
        hit = next((r for r in rows if r["team"]["slug"] == team or norm(r["team"]["name"]).startswith(norm(team))), None)
        if not hit:
            continue  # not in this division that season (promoted/relegated)
        out.append({
            "season": s["season"],
            "complete": s["played"] == s["matches"],
            "position": hit["position"], "of": len(rows),
            "team": hit["team"]["name"],
            "played": hit["played"], "won": hit["won"], "drawn": hit["drawn"], "lost": hit["lost"],
            "goals_for": hit["goals_for"], "goals_against": hit["goals_against"], "points": hit["points"],
        })
    return out


def head_to_head(a: str, b: str, league: str, key: str, since: Optional[str]) -> List[Dict[str, Any]]:
    out = []
    for s in seasons_on_file(league, key, since):
        data = api_get(f"/sports/soccer/leagues/{league}/history/{s['season']}/matches", key, team=a)
        if not data:
            continue
        a_slugs = {t["slug"] for t in data["data"]["teams"]}
        for m in data["data"]["matches"]:
            home, away = m["home"], m["away"]
            other = away if home["slug"] in a_slugs else home
            if not (other["slug"] == b or norm(other["name"]).startswith(norm(b))):
                continue
            sc = m.get("score") or {}
            if m.get("status") != "final" or sc.get("home") is None:
                continue
            a_home = home["slug"] in a_slugs
            gf, ga = (sc["home"], sc["away"]) if a_home else (sc["away"], sc["home"])
            out.append({
                "season": s["season"], "date": m["date"], "round": m.get("round", ""),
                "home": home["name"], "away": away["name"],
                "score": f"{sc['home']}-{sc['away']}",
                "result": "W" if gf > ga else "L" if gf < ga else "D",
            })
    return out


def write_csv(rows: List[Dict[str, Any]], path: str) -> None:
    if not rows:
        return
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {path}")


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"), Path.cwd() / ".env")
    key = os.environ.get("REALTIME_SPORTS_API_KEY")
    if not key:
        sys.exit("Set REALTIME_SPORTS_API_KEY (or put it in .env). Free key: https://www.realtimesportsapi.com/signup")

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("seasons", help="a club's league position and record, season by season")
    p1.add_argument("team")
    p2 = sub.add_parser("h2h", help="every league meeting between two clubs")
    p2.add_argument("team_a")
    p2.add_argument("team_b")
    for p in (p1, p2):
        p.add_argument("--league", default="eng.1", help="eng.1, eng.2, esp.1, ita.1, ger.1, fra.1, mex.1, uefa.champions")
        p.add_argument("--since", help="first season, e.g. 2015-16")
        p.add_argument("--csv", help="also write the rows to this CSV file")
    args = ap.parse_args()

    if args.cmd == "seasons":
        rows = season_by_season(args.team, args.league, key, args.since)
        if not rows:
            sys.exit(f"No seasons found for {args.team!r} in {args.league}.")
        print(f"{rows[0]['team']} in {args.league}, season by season")
        print(f"{'Season':<9} {'Pos':>7} {'P':>3} {'W':>3} {'D':>3} {'L':>3} {'GF':>4} {'GA':>4} {'Pts':>4}")
        for r in rows:
            flag = "" if r["complete"] else "  (season not complete on file)"
            print(f"{r['season']:<9} {str(r['position']) + '/' + str(r['of']):>7} {r['played']:>3} {r['won']:>3} {r['drawn']:>3} {r['lost']:>3} "
                  f"{r['goals_for']:>4} {r['goals_against']:>4} {r['points']:>4}{flag}")
    else:
        rows = head_to_head(args.team_a, args.team_b, args.league, key, args.since)
        if not rows:
            sys.exit(f"No finished meetings found between {args.team_a!r} and {args.team_b!r} in {args.league}.")
        for r in rows:
            print(f"{r['date']}  {r['home']} {r['score']} {r['away']}   ({r['result']} for {args.team_a})")
        w = sum(r["result"] == "W" for r in rows); d = sum(r["result"] == "D" for r in rows); l = sum(r["result"] == "L" for r in rows)
        print(f"\n{len(rows)} meetings: {args.team_a} won {w}, drew {d}, lost {l}")
    if args.csv:
        write_csv(rows, args.csv)


if __name__ == "__main__":
    main()
