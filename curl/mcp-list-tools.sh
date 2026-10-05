#!/usr/bin/env bash
# List the hosted MCP server's tools. Connecting and listing tools need no API key.
# Usage: ./mcp-list-tools.sh
set -euo pipefail
MCP_URL="${RSA_MCP_URL:-https://www.realtimesportsapi.com/api/mcp}"
body="$(curl -sS "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$body" | jq -r '.result.tools[] | "\(.name)\t\(.title)"'
else
  printf '%s\n' "$body"
fi
