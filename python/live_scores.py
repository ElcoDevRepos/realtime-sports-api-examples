"""Games in progress right now for one league.

Usage: python live_scores.py [sport] [league]
  python live_scores.py football nfl
  python live_scores.py soccer eng.1    # soccer is "soccer"; "football" is American football
"""
import sys

from rsa_common import api_get, format_game, run


def main() -> None:
    sport = sys.argv[1] if len(sys.argv) > 1 else "football"
    league = sys.argv[2] if len(sys.argv) > 2 else "nfl"
    body = api_get(f"/sports/{sport}/leagues/{league}/events/live")
    games = body.get("data") or []
    if not games:
        print(f"No {league} games live right now.")
    for g in games:
        print(format_game(g))
    remaining = ((body.get("meta") or {}).get("rateLimit") or {}).get("remaining")
    if remaining is not None:
        print(f"\nCalls remaining this month: {remaining}")


if __name__ == "__main__":
    run(main)
