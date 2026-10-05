# Discord score bot

Posts score changes and final scores for a league (or one team) to a Discord channel, using a
Discord **channel webhook** (no bot account or token needed) and the
[`realtime-sports-api`](https://github.com/ElcoDevRepos/realtime-sports-api-js) TypeScript SDK
(installed from GitHub; it is not yet on npm).

- **WebSocket first:** subscribes to `event_score_change` and `event_final` for your league and posts
  each change once (duplicates after reconnects are dropped).
- **REST polling fallback:** if your plan has no WebSocket access (or `MODE=poll`), it polls
  `events/live` every 60 s while games are live, and when nothing is live checks the league
  scoreboard every 15 min, or sleeps until shortly before the next scheduled game (up to 6 h).

Scores come from public sources and are typically 20-30 seconds behind live play.

## Setup

Requires Node 18+.

```bash
npm install            # pulls the SDK from github:ElcoDevRepos/realtime-sports-api-js
cp .env.example .env   # then fill in REALTIME_SPORTS_API_KEY and DISCORD_WEBHOOK_URL
```

Create the Discord webhook in **Channel settings > Integrations > Webhooks > New Webhook > Copy
Webhook URL**. Treat that URL like a password: anyone with it can post to your channel.

## Run

```bash
npm run dry-run   # prints the messages instead of posting them
npm start         # posts to Discord
npm test          # unit tests for the formatting/diff/scheduling helpers
```

Configuration (`.env`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `REALTIME_SPORTS_API_KEY` | (required) | Your API key |
| `DISCORD_WEBHOOK_URL` | (required unless `--dry-run`) | Discord channel webhook URL |
| `SPORT` / `LEAGUE` | `football` / `nfl` | e.g. `basketball`/`nba`, `hockey`/`nhl`, `baseball`/`mlb`, `soccer`/`eng.1`. Soccer is `soccer`; `football` is American football. |
| `TEAM` | (all) | Only games involving this team abbreviation (e.g. `KC`) or team id |
| `MODE` | `auto` | `auto` (stream, fall back to polling), `stream`, or `poll` |
| `POLL_LIVE_SECONDS` | `60` | Poll interval while games are live (minimum 30) |
| `POLL_IDLE_MINUTES` | `15` | Poll interval when nothing is live and no game is coming up soon |
| `POLL_MAX_IDLE_HOURS` | `6` | Longest sleep before the next scheduled game |

Example output:

```
**KC 14 - 10 BAL**  (5:23 - 2nd Quarter)
FINAL: **KC 21 - 24 BAL**  (Final)
```

## Quota usage

Every REST call counts as one call, and **every message delivered over the WebSocket counts too**.
Monthly quotas as of October 2026 (see [pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples) for current ones): Free 125 (1,000 in the first 30 days), Starter 10,000, Growth 25,000, Pro 50,000,
Scale 500,000. The figures below are estimates; real usage depends on the schedule and how many
scores happen.

**WebSocket mode.** You pay per delivered message, not per minute. Subscriptions are league-wide
(`sport` + `league`), so you are charged for score changes in every game of the league even when
`TEAM` is set (the team filter is applied in the bot). An NFL game typically has somewhere around
8-12 scoring plays, and each touchdown plus extra point can be two score changes, so a full NFL Sunday is very roughly 150-250 messages, and an NFL month is in the
hundreds to low thousands. Ways to cut it:

- subscribe with an `eventId` filter for just your team's game (look the id up with `listEvents`),
- use the server-side `frequency` throttle (`30s`, `1m`, `5m`, ...) on the subscription,
- drop `event_final` if you do not need a separate final message.

**Polling mode (per league or team being followed):**

| Phase | Interval | Calls |
| --- | --- | --- |
| A game is live | 60 s | ~60 per hour, ~210 per 3.5-hour game |
| Nothing live, next game known | sleep until ~2 min before it (max 6 h) | ~4-8 per day |
| Nothing live, nothing scheduled in the window | 15 min | 96 per day |
| Each game that finishes | 1 `getEvent` | 1 per game |

Example: following one NFL team (one ~3.5-hour game per week) costs about 210 calls per game plus a
few idle checks per day, roughly 1,000-1,100 calls per month. That fits Starter comfortably and the
Free plan's first-30-days allowance only barely; the regular Free quota (125 per month) is not
enough for live polling. Following the whole NFL league (Sunday, Monday and Thursday windows, about
17 live hours a week) at 60 s is roughly 1,000 calls per week, about 4,500 per month. Setting
`POLL_LIVE_SECONDS=120` halves the live cost. Polling faster than every 30 s buys nothing: the data
itself is typically 20-30 s behind live play.

## Notes

- This bot does not use team logos or any images.
- Discord webhooks are rate limited; the bot honors Discord's `retry_after` on 429s.
- Events that happen while the WebSocket is reconnecting are not replayed. If you must never miss a
  final, combine the stream with the polling loop or use API webhooks.
