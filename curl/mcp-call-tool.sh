#!/usr/bin/env bash
# Call one MCP tool over plain JSON-RPC (counts as one API call against your quota).
# Usage: ./mcp-call-tool.sh [sport] [league]
source "$(dirname "$0")/_common.sh"
require_key
MCP_URL="${RSA_MCP_URL:-https://www.realtimesportsapi.com/api/mcp}"
SPORT="${1:-football}"
LEAGUE="${2:-nfl}"
body="$(curl -sS -w '\n%{http_code}' "$MCP_URL" \
  -H "Authorization: Bearer ${REALTIME_SPORTS_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_live_events\",\"arguments\":{\"sport\":\"${SPORT}\",\"league\":\"${LEAGUE}\"}}}")"
status="${body##*$'\n'}"; body="${body%$'\n'*}"
if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
  echo "HTTP $status from the MCP server" >&2; pretty "$body" >&2; exit 1
fi
pretty "$body"
