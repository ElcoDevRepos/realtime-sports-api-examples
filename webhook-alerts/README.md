# Webhook game alerts

A tiny Node 18+ server (no dependencies) that receives Realtime Sports API webhook deliveries,
verifies their signature, and prints an alert for each one: games going live, score changes and
final scores. It can also forward each alert to a Slack or Discord incoming webhook.

**Webhooks need a paid plan** (Starter and up; see
[pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).
You can build and test everything here locally without one: `send-sample.js` and the tests sign
their own payloads.

Step-by-step tutorial:
[Webhook game alerts](https://www.realtimesportsapi.com/guides/webhook-game-alerts?utm_source=github&utm_medium=realtime-sports-api-examples)

## How deliveries look

The API sends `POST` requests with a JSON body:

```json
{
  "event": "event.score_change",
  "timestamp": "2026-10-07T15:08:11.040Z",
  "data": {
    "eventId": "401872966", "sport": "football", "league": "nfl",
    "name": "Arizona Cardinals at New York Giants",
    "homeTeam": { "id": "19", "name": "New York Giants", "abbreviation": "NYG", "score": 19 },
    "awayTeam": { "id": "22", "name": "Arizona Cardinals", "abbreviation": "ARI", "score": 17 },
    "previousScore": { "home": 12, "away": 17 }
  }
}
```

Event types: `event.live`, `event.score_change`, `event.status_change` (includes `status` and
`previousStatus`), `event.play` (includes `play`) and `event.final`. Headers include
`X-Webhook-Event` (the event type) and `X-Webhook-Signature`: the **lowercase hex HMAC-SHA256 of
the raw request body**, keyed with your webhook's signing secret, with no `sha256=` prefix. Test
deliveries sent from the dashboard or `POST /webhooks/{id}/test` also carry `X-Webhook-Test: true`.

The server verifies the signature against the exact bytes it received (before `JSON.parse`) with
`crypto.timingSafeEqual`, rejects anything else with `401`, and answers `200` before doing any slow
work so deliveries are not retried.

## Setup

```bash
cd webhook-alerts
cp .env.example .env
```

| Variable | Meaning |
| --- | --- |
| `REALTIME_SPORTS_API_KEY` | Your API key (only `register.js` uses it) |
| `WEBHOOK_SECRET` | The signing secret returned when the webhook is created |
| `PORT`, `WEBHOOK_PATH` | Where the server listens (default `3000`, `/webhook`) |
| `ALERT_EVENTS` | Optional comma-separated event types to alert on (default: all) |
| `FORWARD_URL` | Optional Slack or Discord incoming-webhook URL to forward alerts to |

## Run locally

```bash
WEBHOOK_SECRET=local-dev-secret node server.js                    # terminal 1
WEBHOOK_SECRET=local-dev-secret node send-sample.js event.final   # terminal 2
npm test                                                          # node:test: signs payloads and posts them to the server
```

Captured from a real local run on 7 Oct 2026 (`send-sample.js` for `event.final`,
`event.score_change` and `event.live`, then once with the wrong secret):

```
POST http://localhost:3123/webhook -> HTTP 200 {"received":true}
POST http://localhost:3123/webhook -> HTTP 200 {"received":true}
POST http://localhost:3123/webhook -> HTTP 200 {"received":true}
POST http://localhost:3123/webhook -> HTTP 401 {"error":"invalid signature"}
```

Server output:

```
Listening on http://localhost:3123/webhook
2026-10-07T15:07:57.711Z [NFL] FINAL: ARI 24 - 36 NYG
2026-10-07T15:07:57.827Z [NFL] SCORE: ARI 17 - 19 NYG (was 17-12)
2026-10-07T15:07:57.946Z [NFL] LIVE: TB @ DAL
```

## Go live

1. Deploy `server.js` somewhere with a public **HTTPS** URL (any Node host), or expose your local
   server with a tunnel while testing.
2. Register the webhook (paid plan). The signing secret is shown only once; put it in `.env` as
   `WEBHOOK_SECRET`:

   ```bash
   node register.js create https://your-host.example.com/webhook --leagues nfl,nba --events event.score_change,event.final
   ```

   Output from a real registration on 7 Oct 2026 (to a throwaway URL, deleted right after; secret
   redacted):

   ```
   Created webhook Fxt7qxcaOQajxHXsETlf -> https://example.com/rsa-examples-test
   Events: event.final   Leagues: nfl

   Signing secret (shown only now; put it in .env as WEBHOOK_SECRET):
   <redacted>
   ```

3. Send yourself a signed test delivery: `node register.js test <webhookId> event.final`.
4. Manage it later with `node register.js list` and `node register.js delete <webhookId>`.

`register.js` uses `POST /webhooks`, `GET /webhooks`, `POST /webhooks/{id}/test` and
`DELETE /webhooks/{id}`. Without a paid plan these return `403` and the script says so.

## Notes

- On Starter and Growth, webhook deliveries count toward the same monthly pool as REST calls; Pro
  and Scale have separate delivery allowances. A busy league filter can mean many deliveries on a
  game day, so filter by `leagues` and pick only the events you need (or set a `frequency`
  throttle such as `1m` with `PATCH /webhooks/{id}`).
- A delivery your server failed to acknowledge can be retried or replayed
  (`POST /webhooks/{id}/test` with a `deliveryId`), so make your handler safe to run twice for the
  same event. `GET /webhooks/{id}/deliveries` lists recent failed deliveries.
- Scores are typically 20-30 seconds behind live play.
