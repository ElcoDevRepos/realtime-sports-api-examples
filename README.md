<p align="center"><img src="assets/logo.png" width="160" alt="Realtime Sports API logo"></p>

# Realtime Sports API examples

Runnable examples for the [Realtime Sports API](https://www.realtimesportsapi.com/?utm_source=github&utm_medium=realtime-sports-api-examples):
live scores, schedules, play-by-play, box scores, odds, teams, injuries and news over REST, webhooks,
a WebSocket stream and a hosted MCP server for AI assistants.

| Folder | What's inside |
| --- | --- |
| [`curl/`](curl) | Shell scripts using `curl` (`jq` optional, for pretty output) |
| [`javascript/`](javascript) | Node 18+ scripts using the built-in `fetch`, no dependencies |
| [`python/`](python) | Python 3 scripts using `requests` |
| [`mcp/`](mcp) | MCP client configs for Claude Code, Claude Desktop, Cursor, VS Code, Cline and ChatGPT |
| [`llms-install.md`](llms-install.md) | Setup steps an AI agent (e.g. Cline) can follow to add the hosted MCP server |
| [`discord-score-bot/`](discord-score-bot) | Posts score changes to a Discord channel (WebSocket with REST fallback), uses the JS SDK |
| [`led-scoreboard/`](led-scoreboard) | Terminal / Raspberry Pi RGB LED matrix scoreboard, uses the Python SDK |
| [`google-sheets/`](google-sheets) | Apps Script custom functions: `=RSA_LIVE(...)`, `=RSA_SCHEDULE(...)` and more |

## Coverage and freshness

- **29 leagues monitored live:** NFL, college football, NBA, men's college basketball, MLB, NHL and
  23 soccer competitions (Premier League, MLS, Champions League, LaLiga, Serie A, Bundesliga, Liga MX
  and more).
- **Freshness:** data is aggregated from public sources and is typically 20-30 seconds behind live
  play. There is no SLA, and it is not suitable for sub-second in-play betting.
- **Odds** come from a single source book.

Polling faster than about every 30 seconds does not get you fresher data; use webhooks or the
WebSocket stream for continuous updates.

## Get a key

Create a free account at
[realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).
As of October 2026 the free plan includes 125 calls per month (1,000 during your first 30 days); see
[pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)
for current limits and paid plans.

```bash
git clone https://github.com/ElcoDevRepos/realtime-sports-api-examples
cd realtime-sports-api-examples
cp .env.example .env        # then put your key in REALTIME_SPORTS_API_KEY
```

All the scripts read `REALTIME_SPORTS_API_KEY` from the environment or from `.env` in the repo root,
and stop with a clear message if it isn't set. Never commit your real `.env`.

## Quickstart

**curl**

```bash
./curl/live-scores.sh football nfl          # games in progress now
./curl/scoreboard.sh basketball nba          # recent, live and upcoming games
./curl/schedule.sh football nfl 2026 5       # NFL 2026 regular season, week 5
./curl/event-details.sh football nfl <eventId>
./curl/mcp-list-tools.sh                     # hosted MCP server tools (no key needed)
```

Or directly:

```bash
curl -H "Authorization: Bearer $REALTIME_SPORTS_API_KEY" \
  https://www.realtimesportsapi.com/api/v1/sports/football/leagues/nfl/events/live
```

**JavaScript** (Node 18+)

```bash
node javascript/live-scores.mjs football nfl
node javascript/schedule.mjs football nfl 2026 5
node javascript/event-details.mjs football nfl <eventId>
```

**Python**

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r python/requirements.txt
python python/live_scores.py hockey nhl
python python/schedule.py football nfl 2026 5
python python/event_details.py football nfl <eventId>
```

Sport slugs: `football` (American football), `basketball`, `baseball`, `hockey`, `soccer`. League
slugs: `nfl`, `college-football`, `nba`, `mens-college-basketball`, `mlb`, `nhl`, and soccer
competitions such as `eng.1`, `usa.1`, `uefa.champions`.

Every response is an envelope `{ "success": true, "data": ..., "meta": ... }`; errors look like
`{ "success": false, "error": { "code": "MISSING_TOKEN", "message": "...", "hint": "..." } }` with
HTTP 401 for a missing or unknown key and 429 when the monthly quota is used up.

## Use it from an AI assistant (MCP)

The hosted MCP server lives at `https://www.realtimesportsapi.com/api/mcp` (Streamable HTTP,
`Authorization: Bearer <key>`). It exposes 14 read-only tools (live games, scoreboard, schedule,
play-by-play, box scores, odds, teams, rosters, athlete search, injuries and news). Copy-paste
configs for each client are in [`mcp/`](mcp); the full guide is at
[realtimesportsapi.com/docs/mcp](https://www.realtimesportsapi.com/docs/mcp?utm_source=github&utm_medium=realtime-sports-api-examples).

```bash
claude mcp add --transport http realtime-sports https://www.realtimesportsapi.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

## SDKs

- JavaScript/TypeScript: [ElcoDevRepos/realtime-sports-api-js](https://github.com/ElcoDevRepos/realtime-sports-api-js)
  (`npm install github:ElcoDevRepos/realtime-sports-api-js`)
- Python: [ElcoDevRepos/realtime-sports-api-python](https://github.com/ElcoDevRepos/realtime-sports-api-python)
  (`pip install git+https://github.com/ElcoDevRepos/realtime-sports-api-python`)

Neither is on npm or PyPI yet; install from GitHub as shown.

## Links

- [API docs](https://www.realtimesportsapi.com/docs?utm_source=github&utm_medium=realtime-sports-api-examples)
- [MCP server docs](https://www.realtimesportsapi.com/docs/mcp?utm_source=github&utm_medium=realtime-sports-api-examples)
- [Pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)
- [Sign up (free)](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples)

## License

[MIT](LICENSE)
