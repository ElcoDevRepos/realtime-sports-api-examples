#!/usr/bin/env bash
# Season schedule. NFL and college football also take a week number.
# Usage: ./schedule.sh [sport] [league] [season] [week] [seasonType]
#   ./schedule.sh football nfl 2026 5 2     # NFL 2026, regular season (2), week 5
#   ./schedule.sh hockey nhl 2026           # whole NHL season
source "$(dirname "$0")/_common.sh"
require_key
SPORT="${1:-football}"
LEAGUE="${2:-nfl}"
SEASON="${3:-2026}"
WEEK="${4:-}"
SEASON_TYPE="${5:-2}"
QUERY="seasonType=${SEASON_TYPE}"
[[ -n "$WEEK" ]] && QUERY="${QUERY}&week=${WEEK}"
api_get "/sports/${SPORT}/leagues/${LEAGUE}/seasons/${SEASON}/schedule" "$QUERY"
