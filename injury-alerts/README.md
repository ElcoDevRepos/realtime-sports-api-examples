# Injury report alerts to Discord or Slack (Node.js)

Guide: https://www.realtimesportsapi.com/guides/injury-report-alerts-discord?utm_source=github&utm_medium=realtime-sports-api-examples

Posts NFL, NBA or NHL injury report changes for your teams to a Discord or Slack webhook: a player added to the report, taken off it, or moved between designations (for example Questionable → Out), with the team's note and expected return date when there is one. Works on the Free plan.

Node 18+, no dependencies.

```bash
cp .env.example .env    # REALTIME_SPORTS_API_KEY, and WEBHOOK_URL (leave empty to print)
node injury-alerts.mjs --league nfl --team KC,BUF            # check every 10 minutes
node injury-alerts.mjs --league nba --since 24h --dry-run    # print the last day's changes
node injury-alerts.mjs --league nhl --once                   # one check (cron)
node --test injury.test.mjs                                   # rules + formatting tests
```

By default it skips updates where only the note or return date changed; `--all` sends those too. It remembers the newest change it has seen in `.injury-alerts-state.json`, so restarts don't repeat alerts. Cost: one API call per league per check (144 a day at 10-minute polling).
