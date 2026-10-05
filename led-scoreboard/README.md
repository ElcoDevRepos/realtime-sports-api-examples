# LED / terminal scoreboard

A small Python scoreboard that polls the Realtime Sports API with quota-friendly intervals and draws
the games in your terminal, or on an RGB LED matrix on a Raspberry Pi (optional renderer stub for
[hzeller/rpi-rgb-led-matrix](https://github.com/hzeller/rpi-rgb-led-matrix)). It uses the
[Python SDK](https://github.com/ElcoDevRepos/realtime-sports-api-python)
(installed from GitHub; it is not yet on PyPI).

```
+----------------------------------------------------------+
| NFL - KC                                                 |
+----------------------------------------------------------+
| *   KC  14 - 10  BAL   5:23 - 2nd Quarter                |
+----------------------------------------------------------+
| LIVE - next update in 45 s - calls this run: 37          |
+----------------------------------------------------------+
```

Scores come from public sources and are typically 20-30 seconds behind live play, which is why
polling faster than every 30 s is pointless (the minimum here is 30 s).

## Setup

Python 3.9+.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt     # installs the SDK from GitHub
cp .env.example .env                # add REALTIME_SPORTS_API_KEY
```

Try it without a key first:

```bash
python scoreboard.py --demo --once
```

## Run

```bash
python scoreboard.py --sport football --league nfl --team KC
python scoreboard.py --sport basketball --league nba
python scoreboard.py --sport soccer --league eng.1          # soccer is "soccer"; "football" is American football
python scoreboard.py --sport hockey --league nhl --once     # one fetch, then exit
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--sport` / `--league` | `football` / `nfl` | Any monitored league: `college-football`, `nba`, `mens-college-basketball`, `mlb`, `nhl`, soccer `eng.1`, `usa.1`, `uefa.champions`, ... |
| `--team` | (all) | Only games involving this abbreviation or team id |
| `--live-interval` | `45` | Seconds between polls while a game is live (minimum 30) |
| `--idle-interval` | `900` | Seconds between polls when nothing is live (minimum 300) |
| `--max-idle` | `21600` | Longest sleep (s) before the next scheduled game |
| `--renderer` | `terminal` | `terminal` or `matrix` |
| `--rows` / `--cols` / `--font` | `32` / `64` / 6x10 BDF | Matrix renderer settings |
| `--once` | | Fetch and render once, then exit |
| `--demo` | | Render sample data, no API calls |

### How it polls

- **Nothing live:** one call to the league's events endpoint (`list_events`, the current
  scoreboard/schedule window with recent finals, live and upcoming games). It shows the last finals
  and next games, then waits 15 minutes, or, when the next game is further away, sleeps until about
  2 minutes before it (capped at 6 hours).
- **Something live:** one call to `events/live` (`list_live_events`) every 45 seconds until no game
  is live, then back to idle mode.
- **429 (monthly quota exhausted):** shows a message and waits for `Retry-After` (capped at 6 h).

For a full season schedule (rather than the current window) use the SDK's
`get_season_schedule(sport, league, season, week=..., season_type=...)`.

## Estimated monthly call usage

Every REST call counts as one call. Monthly quotas as of October 2026 (see [pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples) for current ones): Free 125 (1,000 in the first 30 days),
Starter 10,000, Growth 25,000, Pro 50,000, Scale 500,000.

| Phase | Interval | Calls |
| --- | --- | --- |
| A game is live | 45 s | 80 per hour, ~280 per 3.5-hour game |
| Live, `--live-interval 60` | 60 s | 60 per hour, ~210 per game |
| Idle, next game known | until ~2 min before it (max 6 h) | ~4-8 per day |
| Idle, nothing scheduled in the window | 15 min | 96 per day |

Examples (estimates; real numbers depend on the schedule):

| What you follow | Live hours / month | Calls / month at 45 s | Fits |
| --- | --- | --- | --- |
| One NFL team (`--team KC`) | ~15 | ~1,200 + ~200 idle = ~1,400 | Starter |
| Whole NFL | ~75 | ~6,000 + ~200 idle = ~6,200 | Starter |
| One NBA or NHL team (3-4 games/week) | ~40 | ~3,200 + ~200 idle = ~3,400 | Starter |
| Whole NBA (games most nights, ~6 h windows) | ~180 | ~14,500 + idle | Growth |

The regular Free quota (125 calls per month) is enough for occasional `--once` checks, not for
live polling. During the first 30 days (1,000 calls) one team's games at `--live-interval 60` can
fit. Raising `--live-interval` to 60 cuts live usage by a quarter.

## LED matrix (optional)

On a Raspberry Pi with an RGB matrix HAT/bonnet, build and install the Python bindings from
[rpi-rgb-led-matrix](https://github.com/hzeller/rpi-rgb-led-matrix) (follow its README), then:

```bash
sudo .venv/bin/python scoreboard.py --renderer matrix --rows 32 --cols 64 --team KC
```

`MatrixRenderer` in `scoreboard.py` is a starting point: it draws one game per refresh (away team
and score, home team and score, status) in white and amber text, and sets
`hardware_mapping = "adafruit-hat"`; adjust it for your hardware. The import is guarded, so the
script runs anywhere with the terminal renderer. No logos or images are used.
