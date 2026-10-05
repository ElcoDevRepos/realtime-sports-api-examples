#!/usr/bin/env bash
# Games in progress right now for one league (an empty list when nothing is live).
# Usage: ./live-scores.sh [sport] [league]
#   ./live-scores.sh football nfl
#   ./live-scores.sh basketball nba
#   ./live-scores.sh soccer eng.1        # soccer is "soccer"; "football" is American football
source "$(dirname "$0")/_common.sh"
require_key
SPORT="${1:-football}"
LEAGUE="${2:-nfl}"
api_get "/sports/${SPORT}/leagues/${LEAGUE}/events/live"
