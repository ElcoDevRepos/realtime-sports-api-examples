# NHL goal alerts

A goal horn for your team: a terminal line, an optional phone push and an optional "horn" command
for every NHL goal. Node 18+, no dependencies.

- Polls `GET /sports/hockey/leagues/nhl/events/live` every 30 s while games are live.
- A score that goes up is a goal; a score that goes down is a goal taken off the board after review.
- For each goal it makes one `GET /events/{id}/plays?limit=1000` call (a whole NHL game fits in one
  page) and adds the latest scoring play's text, which names the scorer.
- Pushes to your phone through [ntfy](https://ntfy.sh) (free app, plain HTTP POST) if `NTFY_URL` is
  set, and runs `GOAL_COMMAND` (play a sound, flash a smart light) for your team's goals.
- When nothing is live it checks the scoreboard and sleeps until about two minutes before the next
  game.

NHL box scores are not available from the API, so this example works from live scores and
play-by-play only. Data is typically 20-30 seconds behind live play, so the horn sounds after the TV
broadcast, not before it.

Step-by-step tutorial:
[NHL goal alerts](https://www.realtimesportsapi.com/guides/nhl-goal-alerts?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

```bash
cd nhl-goal-alerts
cp .env.example .env   # REALTIME_SPORTS_API_KEY, and optionally TEAM, NTFY_URL, GOAL_COMMAND
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `REALTIME_SPORTS_API_KEY` | (required) | Your API key ([free signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples)) |
| `TEAM` | (every game) | Team abbreviation (`CAR`, `TOR`, `EDM`) or team id |
| `NTFY_URL` | | e.g. `https://ntfy.sh/my-team-goals-x7f3` (pick a hard-to-guess topic; anyone who knows it can read it) |
| `GOAL_COMMAND` | | Shell command for your team's goals, e.g. `afplay ~/horn.mp3` |
| `POLL_SECONDS` | `30` | Poll interval while games are live (minimum 30) |

No horn sound ships with this repo; use any audio file you have the rights to.

## Run

```bash
node alerts.js --once        # live games and their latest scoring play, then exit
node alerts.js --test-horn   # run GOAL_COMMAND once
node alerts.js               # watch and alert (npm start)
npm test                     # unit tests against a real captured NHL scoreboard
```

Example (`node alerts.js --once`, 18 Oct 2026):

```
CAR 1 - 0 CGY (11:56 - 2nd Period) · last goal: ...
```

Alerts look like this (format checked in `test/lib.test.js`):

```
🚨 CAR GOAL! CAR 2 - 1 CGY (13:12 - 2nd Period) · Sebastian Aho (5) Wrist Shot
❌ CAR goal taken off the board. CAR 1 - 1 CGY (12:40 - 2nd Period)
```

## Quota usage

As of October 2026: Free 125 calls/month (1,000 during your first 30 days), Starter 10,000, Growth
25,000 ([pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).

| Pattern | Calls |
| --- | --- |
| One game (~2.5 h live) at 30 s polling | ~300, plus ~6 for scorer lookups |
| Off days with `TEAM` set | ~4-8 a day |
| One team, ~14 games a month | ~4,500 per month (Starter) |
| One team at `POLL_SECONDS=60` | ~2,300 per month |

The Free plan's first-month allowance covers about three games, enough to test. Following every NHL
game every night needs Growth or higher; for that, webhooks (`event.score_change`) are cheaper than
polling because you pay per delivered message instead of per poll.
