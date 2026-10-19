# Men's college basketball scoreboard and March Madness bracket

A command-line tracker for men's college basketball: today's scoreboard, a live watcher that flags
close finishes, and the NCAA tournament by round and region (with CSV export for your bracket
pool). Python 3.9+, standard library only.

| Command | Endpoint | Calls |
| --- | --- | --- |
| `python cbb.py scoreboard [--teams DUKE,UNC]` | `GET /sports/basketball/leagues/mens-college-basketball/events` | 1 |
| `python cbb.py watch [--teams ...] [--margin 5]` | `GET .../events/live`, plus `GET .../events/{id}` once per finished game | 1 per poll |
| `python cbb.py bracket --season 2026 [--csv bracket.csv]` | `GET .../seasons/{season}/tournament` | 1 |

- **Scoreboard:** live games first, then upcoming (with start times), then finals.
- **Watch:** polls live games every 60 s and prints `🔥 Close game` once per game when it's in the
  second half (or overtime) within `--margin` points, and `🏁 Final` when a game ends.
- **Bracket:** the tournament endpoint returns NCAA tournament games (NIT/CBI/CIT excluded) annotated
  with `tournament.region`, `tournament.round` and `tournament.firstFour`. The script groups them
  First Four → 1st Round → 2nd Round → Sweet 16 → Elite 8 → Final Four → Championship, shows the
  winner of each finished game and can write a CSV. The season is the year the tournament is played
  (`--season 2026` = March 2026; 67 games).

The 2026-27 season starts on November 3, 2026. Until then the scoreboard is empty, but `bracket
--season 2026` works today. Box scores and play-by-play for the new season are verified once games
are played; the [NBA box score tracker](../nba-box-score) also runs with
`LEAGUE=mens-college-basketball`. Data is typically 20-30 seconds behind live play.

Step-by-step tutorial:
[College basketball scoreboard and March Madness bracket](https://www.realtimesportsapi.com/guides/college-basketball-scoreboard-march-madness?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

```bash
cd college-basketball
cp .env.example .env              # add REALTIME_SPORTS_API_KEY
python3 cbb.py bracket --season 2026 --csv bracket-2026.csv
python3 cbb.py scoreboard --teams DUKE,UNC,KU
python3 cbb.py watch --margin 4
python3 -m unittest -v            # unit tests for grouping, ordering, winners, close games
```

Team abbreviations are as the API returns them (e.g. `DUKE`, `UNC`, `KU`); look them up with
`GET .../teams` or the [team API pages](https://www.realtimesportsapi.com/apis/mens-college-basketball?utm_source=github&utm_medium=realtime-sports-api-examples).

Bracket output looks like this (format checked in `test_cbb_lib.py`):

```
== First Four ==
  South
    SFPA 68 - 70 ALST  (Final)  -> ALST
== 1st Round ==
  East
    DUKE 81 - 62 MTST  (Final)  -> DUKE
```

## Quota usage

As of October 2026: Free 125 calls/month (1,000 during your first 30 days), Starter 10,000, Growth
25,000 ([pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).

| Pattern | Calls |
| --- | --- |
| `scoreboard` or `bracket` a few times a day | ~100 per month (fits Free) |
| `watch` one team, ~2 h per game, ~8 games a month | ~1,100 per month (Starter) |
| `watch` every game on a busy Saturday (games live ~12 h, ~150 finals) | ~870 that day |
| Tournament weekends (first two rounds, ~12 h a day of live games) | ~3,000 for the four days |

When nothing is live, `watch` makes one scoreboard call and sleeps until about two minutes before the
next tip-off (at most 6 hours), so a day without games costs a handful of calls. `--idle` (30 min)
only applies when no upcoming start time is known.
