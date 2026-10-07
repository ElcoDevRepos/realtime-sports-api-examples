#!/usr/bin/env python3
"""Season analysis with pandas: team records, points for/against, home vs away, average margin.

Pulls every completed game of a season week by week from the Realtime Sports API season schedule
endpoint (NFL and college football support ?week=N), builds a pandas DataFrame and writes CSVs.

Usage:
  python analyze.py                                   # NFL 2025 regular season, weeks 1-18
  python analyze.py --season 2026 --weeks 1-5         # current season so far
  python analyze.py --league college-football --season 2025 --weeks 1-15

Costs one API call per week.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List

import pandas as pd
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


def api_get(path: str, key: str, **params: Any) -> Dict[str, Any]:
    res = requests.get(
        API_BASE + path,
        params={k: v for k, v in params.items() if v is not None},
        headers={"Authorization": f"Bearer {key}"},
        timeout=30,
    )
    if not res.ok:
        try:
            err = res.json().get("error") or {}
        except ValueError:
            err = {}
        sys.exit(f"HTTP {res.status_code} {err.get('code', '')}: {err.get('message', res.text[:200])}")
    return res.json()


def parse_weeks(spec: str) -> List[int]:
    """'1-18' -> [1..18]; '1,3,5' -> [1,3,5]."""
    weeks: List[int] = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-", 1)
            weeks.extend(range(int(a), int(b) + 1))
        elif part.strip():
            weeks.append(int(part))
    return weeks


# ------------------------------------------------------------------------------- fetch


def game_row(e: Dict[str, Any], week: int) -> Dict[str, Any]:
    home, away = e.get("homeTeam") or {}, e.get("awayTeam") or {}
    status = e.get("status") or {}
    return {
        "event_id": e.get("id"),
        "week": week,
        "date": e.get("date"),
        "home_id": home.get("id"),
        "home": home.get("abbreviation") or home.get("name"),
        "away_id": away.get("id"),
        "away": away.get("abbreviation") or away.get("name"),
        "home_score": home.get("score"),
        "away_score": away.get("score"),
        "completed": bool(status.get("completed")) or status.get("state") == "post",
        "neutral_site": bool((e.get("competition") or {}).get("neutralSite")),
    }


def fetch_games(sport: str, league: str, season: int, weeks: Iterable[int], season_type: int, key: str) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    for week in weeks:
        body = api_get(f"/sports/{sport}/leagues/{league}/seasons/{season}/schedule", key, week=week, seasonType=season_type)
        events = body.get("data") or []
        done = [game_row(e, week) for e in events]
        done = [r for r in done if r["completed"]]
        print(f"week {week:>2}: {len(events):>3} games, {len(done):>3} completed", file=sys.stderr)
        rows.extend(done)
        if events and not done:
            break  # reached the part of the season that hasn't been played yet
    games = pd.DataFrame(rows)
    if games.empty:
        return games
    games = games.drop_duplicates("event_id")
    games["home_score"] = pd.to_numeric(games["home_score"])
    games["away_score"] = pd.to_numeric(games["away_score"])
    games["date"] = pd.to_datetime(games["date"], utc=True)
    games["margin"] = (games["home_score"] - games["away_score"]).abs()
    games["winner"] = games.apply(
        lambda r: r["home"] if r["home_score"] > r["away_score"] else (r["away"] if r["away_score"] > r["home_score"] else "TIE"), axis=1
    )
    return games.sort_values("date").reset_index(drop=True)


# ------------------------------------------------------------------------------- analysis


def team_games(games: pd.DataFrame) -> pd.DataFrame:
    """One row per team per game ('long' format), which makes the groupbys trivial."""
    home = games.rename(columns={"home": "team", "away": "opponent", "home_score": "pf", "away_score": "pa"}).assign(venue="home")
    away = games.rename(columns={"away": "team", "home": "opponent", "away_score": "pf", "home_score": "pa"}).assign(venue="away")
    cols = ["event_id", "week", "date", "team", "opponent", "pf", "pa", "venue", "neutral_site"]
    long = pd.concat([home[cols], away[cols]], ignore_index=True)
    long.loc[long["neutral_site"], "venue"] = "neutral"
    long["result"] = (long["pf"] > long["pa"]).map({True: "W", False: "L"})
    long.loc[long["pf"] == long["pa"], "result"] = "T"
    long["diff"] = long["pf"] - long["pa"]
    return long


def standings(long: pd.DataFrame) -> pd.DataFrame:
    g = long.groupby("team")
    table = pd.DataFrame(
        {
            "games": g.size(),
            "wins": g["result"].apply(lambda s: (s == "W").sum()),
            "losses": g["result"].apply(lambda s: (s == "L").sum()),
            "ties": g["result"].apply(lambda s: (s == "T").sum()),
            "points_for": g["pf"].sum(),
            "points_against": g["pa"].sum(),
            "ppg": g["pf"].mean().round(1),
            "opp_ppg": g["pa"].mean().round(1),
            "avg_margin": g["diff"].mean().round(1),
        }
    )
    table["win_pct"] = ((table["wins"] + 0.5 * table["ties"]) / table["games"]).round(3)
    for venue in ("home", "away"):
        sub = long[long["venue"] == venue].groupby("team")["result"]
        table[f"{venue}_record"] = sub.apply(lambda s: f"{(s == 'W').sum()}-{(s == 'L').sum()}" + (f"-{(s == 'T').sum()}" if (s == "T").any() else ""))
        table[f"{venue}_win_pct"] = sub.apply(lambda s: round(((s == "W").sum() + 0.5 * (s == "T").sum()) / len(s), 3))
    table = table.fillna({"home_record": "0-0", "away_record": "0-0"})
    return table.sort_values(["win_pct", "avg_margin"], ascending=False)


def league_summary(games: pd.DataFrame) -> Dict[str, Any]:
    decided = games[(games["winner"] != "TIE") & (~games["neutral_site"])]
    home_wins = (decided["winner"] == decided["home"]).sum()
    top = games.assign(total=games["home_score"] + games["away_score"]).sort_values("total", ascending=False).iloc[0]
    return {
        "games": len(games),
        "home_win_rate": round(home_wins / len(decided), 3) if len(decided) else None,
        "avg_margin": round(games["margin"].mean(), 1),
        "avg_total_points": round((games["home_score"] + games["away_score"]).mean(), 1),
        "one_score_games_pct": round((games["margin"] <= 8).mean(), 3),
        "highest_scoring": f"{top['away']} {top['away_score']} @ {top['home']} {top['home_score']} (week {top['week']})",
    }


def main() -> None:
    here = Path(__file__).resolve().parent
    load_dotenv(here / ".env", here.parent / ".env")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sport", default="football")
    p.add_argument("--league", default="nfl", help="nfl or college-football (leagues with weeks)")
    p.add_argument("--season", type=int, default=2025)
    p.add_argument("--weeks", default="1-18", help="e.g. 1-18 or 1,2,3")
    p.add_argument("--season-type", type=int, default=2, help="1 preseason, 2 regular season, 3 postseason")
    p.add_argument("--out-dir", default=".", help="where to write the CSV files")
    args = p.parse_args()

    key = os.environ.get("REALTIME_SPORTS_API_KEY", "").strip()
    if not key or key == "your_api_key_here":
        sys.exit("Set REALTIME_SPORTS_API_KEY (see .env.example). Get a free key at https://www.realtimesportsapi.com/signup")

    games = fetch_games(args.sport, args.league, args.season, parse_weeks(args.weeks), args.season_type, key)
    if games.empty:
        sys.exit("No completed games found for that season/weeks.")

    long = team_games(games)
    table = standings(long)
    summary = league_summary(games)

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    tag = f"{args.league}_{args.season}"
    games.to_csv(out / f"games_{tag}.csv", index=False)
    table.to_csv(out / f"standings_{tag}.csv")

    pd.set_option("display.width", 140)
    print(f"\n{args.league.upper()} {args.season}: {summary['games']} completed games\n")
    print(table[["wins", "losses", "ties", "win_pct", "ppg", "opp_ppg", "avg_margin", "home_record", "away_record"]].head(10).to_string())
    print("\nLeague-wide:")
    for k, v in summary.items():
        print(f"  {k:<20} {v}")
    print(f"\nWrote {out / f'games_{tag}.csv'} and {out / f'standings_{tag}.csv'}")


if __name__ == "__main__":
    main()
