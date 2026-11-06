"""Poll the live endpoint and print only what changed: score, clock/period, final.

Usage: python watch.py [sport] [league] [seconds]
  python watch.py basketball nba 30

Every poll is one API call: a 3-hour game polled every 30 s is about 360 calls.
Data is typically 20-30 seconds behind live play; not for in-play betting.
"""
import sys
import time
from datetime import datetime

from rsa_common import api_get, format_game, run


def main() -> None:
    sport = sys.argv[1] if len(sys.argv) > 1 else "football"
    league = sys.argv[2] if len(sys.argv) > 2 else "nfl"
    seconds = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    last: dict = {}  # event id -> last line printed
    while True:
        games = api_get(f"/sports/{sport}/leagues/{league}/events/live").get("data") or []
        for g in games:
            line = format_game(g)
            if last.get(g["id"]) != line:
                print(f"{datetime.now():%H:%M:%S}  {line}", flush=True)
                last[g["id"]] = line
        if not games and not last:
            print(f"No {league} games live right now.", flush=True)
        time.sleep(seconds)


if __name__ == "__main__":
    run(main)
