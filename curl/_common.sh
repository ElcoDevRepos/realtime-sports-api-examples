#!/usr/bin/env bash
# Shared helpers for the curl examples. Source it; don't run it directly.
set -euo pipefail

API_BASE="${RSA_API_BASE:-https://www.realtimesportsapi.com/api/v1}"

# Load ../.env (KEY=value lines) if present; variables already in the environment win.
_env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
if [[ -f "$_env_file" ]]; then
  while IFS='=' read -r k v; do
    [[ -z "$k" || "$k" == \#* ]] && continue
    [[ -z "${!k:-}" ]] && export "$k=$v"
  done < "$_env_file"
fi

require_key() {
  if [[ -z "${REALTIME_SPORTS_API_KEY:-}" || "$REALTIME_SPORTS_API_KEY" == "your_api_key_here" ]]; then
    echo "Set REALTIME_SPORTS_API_KEY first (export it, or copy .env.example to .env)." >&2
    echo "Get a free key at https://www.realtimesportsapi.com/signup" >&2
    exit 1
  fi
}

# api_get <path> [query-string]  -> prints the JSON body; exits non-zero with the API error on failure.
api_get() {
  local path="$1" query="${2:-}" url body status
  url="${API_BASE}${path}"
  [[ -n "$query" ]] && url="${url}?${query}"
  body="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer ${REALTIME_SPORTS_API_KEY}" "$url")"
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "HTTP $status from GET $path" >&2
    pretty "$body" >&2
    exit 1
  fi
  pretty "$body"
}

# Pretty-print JSON with jq when it is installed, otherwise print it raw.
pretty() {
  if command -v jq >/dev/null 2>&1; then printf '%s' "$1" | jq .; else printf '%s\n' "$1"; fi
}
