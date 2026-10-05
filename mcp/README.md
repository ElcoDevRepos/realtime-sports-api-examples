# MCP client configs

The Realtime Sports API runs a **hosted** Model Context Protocol server. There is nothing to
install or run locally: point your MCP client at one URL and authenticate with your API key.

| | |
| --- | --- |
| Endpoint | `https://www.realtimesportsapi.com/api/mcp` (Streamable HTTP, stateless JSON-RPC) |
| Auth | `Authorization: Bearer YOUR_API_KEY`, the same key as the REST API ([get a free key](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples)) |
| Metering | Each tool call counts as one API call against your monthly quota. `initialize` and `tools/list` work without a key and are free. |
| Full docs | [realtimesportsapi.com/docs/mcp](https://www.realtimesportsapi.com/docs/mcp?utm_source=github&utm_medium=realtime-sports-api-examples) |

Replace `YOUR_API_KEY` in the files below with your key. Treat any file or URL that contains the key
as a secret, and rotate the key in the dashboard if it leaks.

## Claude Code

[`claude-code.sh`](claude-code.sh):

```bash
claude mcp add --transport http realtime-sports https://www.realtimesportsapi.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

Then ask, for example: "Which NFL games are live right now?" or "Show me the college football week 6
schedule."

## Claude Desktop

**Option A, custom connector:** in Settings > Connectors choose *Add custom connector* and paste the
URL with your key as a query parameter (custom connectors don't accept headers):

```
https://www.realtimesportsapi.com/api/mcp?key=YOUR_API_KEY
```

**Option B, config file:** keep the key in a header by bridging through `mcp-remote` in
`claude_desktop_config.json` (requires Node.js). See
[`claude_desktop_config.json`](claude_desktop_config.json):

```json
{
  "mcpServers": {
    "realtime-sports": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://www.realtimesportsapi.com/api/mcp",
               "--header", "Authorization:${RSA_AUTH}"],
      "env": { "RSA_AUTH": "Bearer YOUR_API_KEY" }
    }
  }
}
```

## Cursor

Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project). See
[`cursor.mcp.json`](cursor.mcp.json):

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

## VS Code (GitHub Copilot agent mode)

Save [`vscode.mcp.json`](vscode.mcp.json) as `.vscode/mcp.json` in your workspace. VS Code prompts
for the key once and stores it securely, so it never sits in the file:

```json
{
  "inputs": [
    { "type": "promptString", "id": "realtime-sports-api-key", "description": "Realtime Sports API key", "password": true }
  ],
  "servers": {
    "realtime-sports": {
      "type": "http",
      "url": "https://www.realtimesportsapi.com/api/mcp",
      "headers": { "Authorization": "Bearer ${input:realtime-sports-api-key}" }
    }
  }
}
```

## Cline

Open Cline's MCP Servers panel, choose *Configure MCP Servers*, and merge
[`cline_mcp_settings.json`](cline_mcp_settings.json) into `cline_mcp_settings.json`:

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

Cline can also set this up for you: point it at [`../llms-install.md`](../llms-install.md).

## ChatGPT (connectors)

ChatGPT can add remote MCP servers as custom connectors when developer mode is enabled (Settings >
Apps & Connectors > Advanced). Create a connector with the URL below and choose no authentication,
since the key travels in the URL. Menu names change often; check OpenAI's current connector
documentation if these steps don't match.

```
https://www.realtimesportsapi.com/api/mcp?key=YOUR_API_KEY
```

## Any other client, or a quick test

The server is stateless: every request is a JSON-RPC POST. [`../curl/mcp-list-tools.sh`](../curl/mcp-list-tools.sh)
lists the tools without a key; [`../curl/mcp-call-tool.sh`](../curl/mcp-call-tool.sh) calls one:

```bash
curl -s https://www.realtimesportsapi.com/api/mcp \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_live_events","arguments":{"sport":"football","league":"nfl"}}}'
```

## Tools

All 14 tools are read-only. Lists return compact game objects by default (pass `detail: "full"` for
the complete REST shape). Standings are not available yet.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_leagues` | - | The 29 monitored leagues with the sport/league slugs the other tools take. |
| `get_live_events` | `sport, league, include_odds?, detail?` | Games in progress now, with score, clock and status. |
| `get_events` | `sport, league, limit?, detail?` | Current scoreboard: recent, live and upcoming games. |
| `get_event` | `sport, league, event_id, include_odds?` | Full details for one game. |
| `get_plays` | `sport, league, event_id, limit?, page?` | Play-by-play, paginated. |
| `get_box_score` | `sport, league, event_id` | Team totals and player stats. |
| `get_odds` | `sport, league, event_id` | Current spread, moneyline and total (single source book). |
| `get_schedule` | `sport, league, start_date?, end_date?, season?, week?, season_type?, detail?` | Games for a date range (up to 31 days) or an NFL/college football week. |
| `list_teams` | `sport, league, limit?, page?` | Teams in a league. |
| `get_team` | `sport, league, team_id` | One team: record, standing summary, venue. |
| `get_team_roster` | `sport, league, team_id` | Current roster grouped by position. |
| `search_athletes` | `sport, league, query, limit?` | Find players by name. |
| `get_injuries` | `sport, league, team_id?` | Current injury report. |
| `get_news` | `sport, league, team_id?, limit?` | Latest league or team headlines. |

## Errors and limits

- A missing or unknown key returns HTTP 401; an exhausted monthly quota returns HTTP 429 with
  `Retry-After`, the same bodies as the REST API.
- Tool-level problems (unknown league, game not found, box score not available yet) come back as
  tool results with `isError: true` and an error code.
- For continuous live updates in your own app, use webhooks or the WebSocket stream rather than
  polling through an assistant.
