# Slack live-score bot

Posts live score changes for a league to a Slack channel through a Slack
[Incoming Webhook](https://api.slack.com/messaging/webhooks). Node 18+, no dependencies.

- Polls `GET /sports/{sport}/leagues/{league}/events/live` every 60 s while games are live.
- Compares each poll with the previous one and posts a message when a game **starts**, when the
  **score changes**, and the **final score** when a game drops off the live list (one
  `GET /events/{id}` call per finished game).
- When nothing is live it reads the league scoreboard (`GET /events`) once and sleeps until about two
  minutes before the next scheduled game (at most 6 h), so idle days cost only a few calls.

Scores are aggregated from public sources and are typically 20-30 seconds behind live play.

Step-by-step tutorial:
[Build a Slack live scores bot](https://www.realtimesportsapi.com/guides/slack-live-scores-bot?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

1. Get a free API key at
   [realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).
2. In Slack, create an app at [api.slack.com/apps](https://api.slack.com/apps), turn on
   **Incoming Webhooks**, add one for your channel and copy its URL. Anyone with that URL can post
   to the channel, so keep it secret.
3. Configure:

```bash
cd slack-scoreboard
cp .env.example .env   # fill in REALTIME_SPORTS_API_KEY and SLACK_WEBHOOK_URL
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `REALTIME_SPORTS_API_KEY` | (required) | Your API key |
| `SLACK_WEBHOOK_URL` | (required unless dry run) | Slack Incoming Webhook URL |
| `SPORT` / `LEAGUE` | `football` / `nfl` | e.g. `basketball`/`nba`, `hockey`/`nhl`, `baseball`/`mlb`, `soccer`/`eng.1` |
| `POLL_SECONDS` | `60` | Poll interval while games are live (minimum 30) |
| `IDLE_MINUTES` | `15` | Poll interval when nothing is live and no start time is known |

## Run

```bash
node bot.js --once                 # print the Slack payload for every game live right now (no posting)
node bot.js --once --scoreboard    # same, for the whole scoreboard window (upcoming, live, final)
node bot.js --once --post          # one pass, really posting to Slack
node bot.js --dry-run              # the full polling loop, printing payloads instead of posting
node bot.js                        # the full polling loop, posting to Slack (npm start)
npm test                           # unit tests for the diff and formatting logic (node:test)
```

Payloads go to stdout (one JSON object per line) and log lines to stderr, so you can pipe the
output into `jq`.

## Example output

Captured from a real run on 7 Oct 2026 (`SPORT=hockey LEAGUE=nhl node bot.js --once --scoreboard`):

```json
{"text":"PIT @ WSH (Wed, October 7th at 7:30 PM EDT)","blocks":[{"type":"section","text":{"type":"mrkdwn","text":"*PIT @ WSH*"}},{"type":"context","elements":[{"type":"mrkdwn","text":"NHL · Wed, October 7th at 7:30 PM EDT"}]}]}
{"text":"COL @ WPG (Wed, October 7th at 7:30 PM EDT)","blocks":[{"type":"section","text":{"type":"mrkdwn","text":"*COL @ WPG*"}},{"type":"context","elements":[{"type":"mrkdwn","text":"NHL · Wed, October 7th at 7:30 PM EDT"}]}]}
{"text":"EDM @ ANA (Wed, October 7th at 10:00 PM EDT)","blocks":[{"type":"section","text":{"type":"mrkdwn","text":"*EDM @ ANA*"}},{"type":"context","elements":[{"type":"mrkdwn","text":"NHL · Wed, October 7th at 10:00 PM EDT"}]}]}
```

While games are live, the loop posts messages like these (the formats checked in `test/lib.test.js`):

```
:rotating_light: Score: TB 14 - 10 DAL (5:23 - 2nd Quarter)
:checkered_flag: Final: TB 21 - 24 DAL (Final)
```

## Quota usage

Every REST call counts toward your monthly quota (as of October 2026: Free 125 calls/month, 1,000
during the first 30 days; Starter 10,000; see
[pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)
for current numbers).

| Phase | Calls |
| --- | --- |
| A game is live, 60 s polling | ~60 per hour, ~210 per 3.5-hour NFL game window |
| Each game that finishes | 1 |
| Nothing live | 2 per wake-up (live + scoreboard), a few per day |

Following one NFL league on Sundays is roughly 1,000 calls per week at 60 s, so live polling needs a
paid plan. `POLL_SECONDS=120` halves that. Polling faster than every 30 s buys nothing, because the
data itself is typically 20-30 s behind live play. If you are on a paid plan and would rather not
poll at all, see [`webhook-alerts/`](../webhook-alerts), which receives pushes instead.

## Notes

- A score that changes and changes back between two polls is not reported (the bot compares
  snapshots).
- On restart the first poll only records a baseline; it does not re-post games already in
  progress.
- Slack rate-limits incoming webhooks to about one message per second; the bot retries once on 429.
