#!/usr/bin/env bash
# One game: details, box score and the first page of play-by-play (3 API calls).
# Find event ids with live-scores.sh or scoreboard.sh.
# Usage: ./event-details.sh <sport> <league> <eventId>
source "$(dirname "$0")/_common.sh"
require_key
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <sport> <league> <eventId>   (e.g. $0 football nfl 401772982)" >&2
  exit 1
fi
SPORT="$1"; LEAGUE="$2"; EVENT_ID="$3"
BASE="/sports/${SPORT}/leagues/${LEAGUE}/events/${EVENT_ID}"
echo "# Event"; api_get "$BASE"
echo "# Box score"; api_get "${BASE}/boxscore"
echo "# Plays (first 25)"; api_get "${BASE}/plays" "limit=25"
