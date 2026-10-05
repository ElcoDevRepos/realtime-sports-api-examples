#!/usr/bin/env bash
# Add the hosted Realtime Sports API MCP server to Claude Code.
# Replace YOUR_API_KEY with your key (free at https://www.realtimesportsapi.com/signup).
claude mcp add --transport http realtime-sports https://www.realtimesportsapi.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
