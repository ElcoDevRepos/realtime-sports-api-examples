#!/usr/bin/env bash
# Current scoreboard window: recent finals, live and upcoming games.
# Usage: ./scoreboard.sh [sport] [league] [limit]
source "$(dirname "$0")/_common.sh"
require_key
SPORT="${1:-basketball}"
LEAGUE="${2:-nba}"
LIMIT="${3:-10}"
api_get "/sports/${SPORT}/leagues/${LEAGUE}/events" "limit=${LIMIT}"
