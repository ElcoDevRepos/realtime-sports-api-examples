# OBS live score overlay

A live score bug for your stream: a transparent HTML page you add to OBS (or Streamlabs, vMix, any
tool with a browser source), fed by a tiny local Node server that keeps your API key off the page.
Node 18+, no dependencies.

- `server.js` serves the overlay at `/` and a small JSON endpoint at `/score`.
- `/score` reads the league scoreboard (`GET /sports/{sport}/leagues/{league}/events`) and picks your
  team's game: live first, then the next upcoming game, then the last final.
- Results are cached on the server: 30 s while live, until ~5 min before start when upcoming (max
  10 min), 10 min after a final. Any number of scenes or browser sources share one upstream call.
- The page refreshes every 15 s from the local cache, flashes a team's box when it scores, uses team
  colours and abbreviations only (no logos), and hides itself when there's no game.

Data is typically 20-30 seconds behind live play, about the same delay as most TV streams.

Step-by-step tutorial:
[OBS live score overlay](https://www.realtimesportsapi.com/guides/obs-live-score-overlay?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

```bash
cd obs-overlay
cp .env.example .env    # add REALTIME_SPORTS_API_KEY
node server.js          # Overlay on http://127.0.0.1:3030/?league=nba&team=BOS
```

In OBS: **Sources > + > Browser**, URL `http://127.0.0.1:3030/?league=nba&team=BOS`, width 640,
height 120. The page background is transparent, so only the score bug shows.

| Query parameter | Example | Meaning |
| --- | --- | --- |
| `league` | `nba`, `nhl`, `nfl`, `mlb`, `college-football`, `mens-college-basketball`, `eng.1` | League slug |
| `team` | `BOS` or a team id | Team to follow (omit for the first live game) |
| `sport` | `soccer` | Only needed for non-US leagues (inferred for the six US leagues) |

`HOST` defaults to `127.0.0.1` so only your own machine can reach the server. Set `HOST=0.0.0.0`
only if OBS runs on another computer on your network.

## Test

```bash
npm test   # pickGame / TTL / cache / slug tests against real captured NBA and NHL scoreboards
curl -s "http://127.0.0.1:3030/score?league=nhl&team=CAR"
```

Sample `/score` response (18 Oct 2026):

```json
{"id":"401892534","state":"in","detail":"9:48 - 2nd Period","away":{"abbr":"CAR","score":1,"color":"#e30426"},"home":{"abbr":"CGY","score":0,"color":"#dd1a32"}}
```

## Quota usage

As of October 2026: Free 125 calls/month (1,000 during your first 30 days), Starter 10,000
([pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).
Calls are only made while the overlay is open in OBS.

| Pattern | Calls |
| --- | --- |
| 3-hour stream during a live game | ~360 |
| Overlay open before tip-off (upcoming game) | ~6-12 an hour |
| A weekly 3-hour watch-along stream | ~1,500 per month (Starter) |

Free covers a couple of test streams in your first month.
