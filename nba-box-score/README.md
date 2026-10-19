# NBA live box score tracker

Live NBA box scores in your terminal, plus alerts when a player you care about hits a milestone:
20/30/40/50 points, a double-double or a triple-double. Node 18+, no dependencies.

- Finds live games with `GET /sports/basketball/leagues/nba/events/live` (optionally one `TEAM`).
- Refreshes each game's `GET /events/{id}/boxscore` every 60 s and redraws the screen: score,
  quarter-by-quarter line, and each team's top five scorers (points, rebounds, assists, FG, 3PT,
  minutes).
- Alerts once per player per milestone (to stdout, and to a Discord or Slack webhook if
  `WEBHOOK_URL` is set). Milestones already reached when the tracker starts are recorded silently.
- `--event <id>` prints any game's box score, live or finished.

Box score player stats: `points`, `rebounds` and `assists` are numbers and `minutes` a string; the
other stats keep their own keys as strings (`fieldGoalsMade-fieldGoalsAttempted: "11-22"`,
`steals: "2"`, ...), so `lib.js` reads them defensively. Data is typically 20-30 seconds behind live
play.

The same code works for men's college basketball (`LEAGUE=mens-college-basketball`) once its season
starts in November.

Step-by-step tutorial:
[NBA live box score tracker](https://www.realtimesportsapi.com/guides/nba-live-box-score-tracker?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

```bash
cd nba-box-score
cp .env.example .env   # REALTIME_SPORTS_API_KEY, and optionally TEAM, WATCH, WEBHOOK_URL
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `REALTIME_SPORTS_API_KEY` | (required) | Your API key ([free signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples)) |
| `TEAM` | (every game) | Team abbreviation (`BOS`, `LAL`, `NY`) or team id |
| `WATCH` | (everyone) | Comma-separated player names to alert on |
| `POINT_THRESHOLDS` | `20,30,40,50` | Point totals that alert |
| `WEBHOOK_URL` | | Discord or Slack webhook for alerts |
| `POLL_SECONDS` | `60` | Refresh interval while live (minimum 30) |

## Run

```bash
node tracker.js --event 401909088   # one game's box score (find ids with GET /events)
node tracker.js --once              # every live game's box score, once
node tracker.js                     # live, refreshing tracker with alerts (npm start)
npm test                            # unit tests (node:test)
```

Output (format checked in `test/lib.test.js`; names in the fixture are made up):

```
BOS 99 @ DET 104  ·  Final
  BOS   30  22  21  26
  DET   24  28  25  27
  BOS
    Away Forward  27 PTS  10 REB  10 AST  (9-20 FG, 3-8 3PT, 38 MIN)
  ...
🏀 Home Guard (DET) has 30+ points: Home Guard  31 PTS  6 REB  11 AST  (11-22 FG, 4-9 3PT, 36 MIN)
```

## Quota usage

As of October 2026: Free 125 calls/month (1,000 during your first 30 days), Starter 10,000, Growth
25,000 ([pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).

Each refresh costs one live-games call plus one box score call per live game.

| Pattern | Calls |
| --- | --- |
| One game (~2.5 h) at 60 s | ~300 |
| One team, ~14 games a month | ~4,200 per month (Starter) |
| Every game on a 10-game night | ~2,000 per night (Pro or Scale for a full season) |
| `--event <id>` | 2 per run |

The first-month 1,000 free calls cover about three full games. Set `TEAM` to keep it cheap: with a
team set the tracker sleeps until that team's next game.
