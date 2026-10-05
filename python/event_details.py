"""One game: details, box score and the latest plays (3 API calls).

Usage: python event_details.py <sport> <league> <eventId>
Find event ids with live_scores.py (printed in [brackets]).
"""
import sys

from rsa_common import api_get, format_game, run


def main() -> None:
    if len(sys.argv) < 4:
        sys.exit("Usage: python event_details.py <sport> <league> <eventId>   (e.g. football nfl 401772982)")
    sport, league, event_id = sys.argv[1:4]
    base = f"/sports/{sport}/leagues/{league}/events/{event_id}"
    print(format_game(api_get(base)["data"]))
    box = api_get(f"{base}/boxscore")["data"] or {}
    print("\nBox score keys:", ", ".join(box.keys()))
    plays = api_get(f"{base}/plays", limit=10)["data"] or []
    print("\nPlays:")
    for p in plays:
        print(" -", p.get("text") or str(p)[:120])


if __name__ == "__main__":
    run(main)
