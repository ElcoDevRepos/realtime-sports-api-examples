# Installing the Realtime Sports API MCP server

Instructions for an AI coding agent (Cline, Claude Code, Cursor, etc.) setting up the **hosted**
Realtime Sports API MCP server for a user. There is nothing to download, build or run: the server is
a remote Streamable HTTP endpoint.

- Endpoint: `https://www.realtimesportsapi.com/api/mcp`
- Transport: Streamable HTTP (stateless JSON-RPC over POST)
- Auth: HTTP header `Authorization: Bearer <API_KEY>`
- Server name to use: `realtime-sports`

## Step 1: get an API key

Ask the user for their Realtime Sports API key. If they don't have one, tell them to create a free
account at https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=llms-install and
copy the key from the dashboard. Do not invent a key, and do not continue without one: every tool
call needs it (only `initialize` and `tools/list` work without a key).

The free plan includes a small monthly call allowance and each tool call counts as one API call.
Current limits are on https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=llms-install

## Step 2: add the remote server to the client's MCP settings

For **Cline**, add this entry under `mcpServers` in `cline_mcp_settings.json`, replacing
`YOUR_API_KEY` with the user's key. Keep any existing servers in the file.

```json
{
  "mcpServers": {
    "realtime-sports": {
      "type": "streamableHttp",
      "url": "https://www.realtimesportsapi.com/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

For **Claude Code**, run:

```bash
claude mcp add --transport http realtime-sports https://www.realtimesportsapi.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

For **Cursor**, add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "realtime-sports": {
      "url": "https://www.realtimesportsapi.com/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

Other clients: see https://github.com/ElcoDevRepos/realtime-sports-api-examples/tree/main/mcp

## Step 3: verify

1. Check that the server shows as connected and exposes 14 tools (`list_leagues`, `get_live_events`,
   `get_events`, `get_event`, `get_plays`, `get_box_score`, `get_odds`, `get_schedule`,
   `list_teams`, `get_team`, `get_team_roster`, `search_athletes`, `get_injuries`, `get_news`).
2. Call `list_leagues` (one metered call) to confirm the key works. If the header is missing, the
   tool returns an error result with a sign-up link instead of data; an HTTP 401 means the key is
   wrong; an HTTP 429 means the monthly quota is used up.

Optional shell check without a key (lists tools, not metered):

```bash
curl -s https://www.realtimesportsapi.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Notes to pass on to the user

- Coverage: 29 leagues monitored live: NFL, college football, NBA, men's college basketball, MLB,
  NHL and 23 soccer competitions. Sport slugs: `football` (American football), `basketball`,
  `baseball`, `hockey`, `soccer`.
- Freshness: data is aggregated from public sources and is typically 20-30 seconds behind live play.
  There is no SLA. Not suitable for sub-second in-play betting. Odds come from a single source book.
- The API key is a secret: don't commit config files that contain it.
