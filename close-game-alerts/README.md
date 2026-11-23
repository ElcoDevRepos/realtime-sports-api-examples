# Close-game alerts to Discord or Slack (Node.js)

Guide: https://www.realtimesportsapi.com/guides/close-game-alerts?utm_source=github&utm_medium=realtime-sports-api-examples

Posts to a Discord or Slack webhook when an NBA, NHL or NFL game gets tight late, when it goes to overtime, and the final score of games it alerted on. Each game alerts at most once per stage.

| League | Close means |
| --- | --- |
| NBA | 4th quarter or OT, 5:00 or less left, within 5 points |
| NHL | 3rd period, within one goal (overtime always alerts) |
| NFL | 4th quarter or OT, 5:00 or less left, within 8 points |

Node 18+, no dependencies. Live, in-progress scores need the free 7-day trial (no card) or a paid plan; on the Free plan `/events/live` answers 403 `LIVE_DATA_REQUIRES_TRIAL`.

```bash
cp .env.example .env    # REALTIME_SPORTS_API_KEY, and WEBHOOK_URL (leave empty to print)
node close-game-alerts.mjs --league nba                  # poll every 60 s
node close-game-alerts.mjs --league nhl,nba --every 30
node --test close-game.test.mjs                          # rule tests
```

Cost: one call per league per poll, plus one per alerted game when it ends.
