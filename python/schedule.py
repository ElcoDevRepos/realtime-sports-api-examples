"""Season schedule. NFL and college football also take a week.

Usage: python schedule.py [sport] [league] [season] [week] [seasonType]
  python schedule.py football nfl 2026 5 2    # 2026 regular season, week 5
  python schedule.py hockey nhl 2026
"""
import sys

from rsa_common import api_get, format_game, run


def main() -> None:
    args = sys.argv[1:] + [None] * 5
    sport, league, season = args[0] or "football", args[1] or "nfl", args[2] or "2026"
    week, season_type = args[3], args[4] or "2"
    body = api_get(f"/sports/{sport}/leagues/{league}/seasons/{season}/schedule", week=week, seasonType=season_type)
    games = body.get("data") or []
    for g in games:
        print(f"{g.get('date', '')}  {format_game(g)}")
    print(f"\n{len(games)} games")


if __name__ == "__main__":
    run(main)
