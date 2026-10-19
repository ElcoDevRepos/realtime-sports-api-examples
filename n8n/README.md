# n8n score alert workflows

Two importable [n8n](https://n8n.io) workflows that send live score alerts to Telegram. Swap the
last node for Slack, Discord, email, SMS or anything else n8n connects to.

| Workflow | Plan | How it works |
| --- | --- | --- |
| [`workflows/poll-score-alerts.json`](workflows/poll-score-alerts.json) | Free / Starter | Schedule (every minute) → "Worth calling?" gate → `GET /events` → score diff → Telegram |
| [`workflows/webhook-score-alerts.json`](workflows/webhook-score-alerts.json) | Paid plans (webhooks) | Realtime Sports API webhook → format → Telegram. No polling at all |

**Polling workflow.** The schedule fires every minute, but a Code node gate only lets it call the API
when it's worth it: every 2 minutes while your team's game is live, about 5 minutes before the next
start, otherwise every 3 hours. One call to the league scoreboard (`GET /sports/{sport}/leagues/{league}/events`)
returns live scores and upcoming start times. The diff node remembers the last scores in the
workflow's static data and emits `🟢 Started`, `🚨 Score` and `🏁 Final` messages. Its first run
only records a baseline.

**Webhook workflow.** Register the n8n webhook URL with the API (`POST /api/v1/webhooks`, events
`event.live`, `event.score_change`, `event.final`, optional `leagues` filter). Each delivery becomes
one message; plays and clock updates are skipped (add cases in `code/format-alert.js` if you want
them). The webhook path is the only thing protecting the URL, so change it to something random.
For signature checking (`X-Webhook-Signature`, HMAC-SHA256 of the raw body) see the
[webhook-alerts](../webhook-alerts) example.

Data is typically 20-30 seconds behind live play.

Step-by-step tutorial:
[n8n sports score alerts](https://www.realtimesportsapi.com/guides/n8n-sports-score-alerts?utm_source=github&utm_medium=realtime-sports-api-examples)

## Import

1. Get a free API key at
   [realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).
2. In n8n: **Workflows > Import from File** and pick a JSON file from `workflows/`.
3. Polling workflow: open **Get scoreboard**, create a **Header Auth** credential with name
   `Authorization` and value `Bearer YOUR_API_KEY`, and change the league in the URL if you want
   (default `basketball/leagues/nba`). Open **Score changes** and set `TEAM` (e.g. `BOS`, or `''` for
   every game).
4. Open **Send to Telegram**, add your Telegram credential (bot token from @BotFather) and set the
   chat id.
5. **Activate** the workflow. Static data (the remembered scores and the next check time) is only
   saved for active workflows, not for manual test runs.

On n8n Cloud every gate run counts as an execution; if that matters, change the schedule to every
2 minutes during your game hours only (e.g. a cron trigger).

## Test and rebuild

The Code-node logic lives in `code/` and is unit tested; `build.mjs` pastes it into the workflow
JSON, so edit `code/` and rebuild instead of editing the JSON by hand.

```bash
npm test     # rebuilds workflows/, then runs node --test against a real captured NHL scoreboard
```

## Quota usage

As of October 2026: Free 125 calls/month (1,000 during your first 30 days), Starter 10,000; webhook
deliveries count against the same monthly pool on paid plans
([pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).

| Pattern | Calls / deliveries |
| --- | --- |
| Polling, idle (check every 3 hours) | ~8 a day, ~240 a month |
| Polling, one NBA/NHL game (~2.5 h at 2 min) | ~75 |
| Polling, one team for a month (~14 games) | ~1,300 (Starter) |
| Webhooks, one NFL league for a week, scores and finals | a few hundred deliveries |

The webhook workflow makes no API calls; you pay per delivered message. Use the `leagues` filter
when you register it so you only receive the leagues you care about.
