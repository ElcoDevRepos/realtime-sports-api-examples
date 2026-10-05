"""Shared helpers for the Python examples (uses `requests`)."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")

# Load ../.env (KEY=value lines) if present; variables already in the environment win.
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


class ApiError(Exception):
    def __init__(self, status: int, body: Optional[Dict[str, Any]], retry_after: Optional[str]):
        err = (body or {}).get("error") or {}
        self.status = status
        self.code = err.get("code")
        self.hint = err.get("hint")
        self.retry_after = retry_after
        super().__init__(f"HTTP {status} {self.code or ''}: {err.get('message', 'request failed')}")


def require_key() -> str:
    key = os.environ.get("REALTIME_SPORTS_API_KEY", "").strip()
    if not key or key == "your_api_key_here":
        sys.exit(
            "Set REALTIME_SPORTS_API_KEY first (export it, or copy .env.example to .env).\n"
            "Get a free key at https://www.realtimesportsapi.com/signup"
        )
    return key


def api_get(path: str, **query: Any) -> Dict[str, Any]:
    """GET a path under /api/v1 and return the envelope {success, data, meta}. Raises ApiError on non-2xx."""
    key = require_key()
    params = {k: v for k, v in query.items() if v is not None}
    res = requests.get(API_BASE + path, params=params, headers={"Authorization": f"Bearer {key}"}, timeout=30)
    try:
        body = res.json()
    except ValueError:
        body = None
    if not res.ok:
        raise ApiError(res.status_code, body, res.headers.get("Retry-After"))
    return body


def format_game(g: Dict[str, Any]) -> str:
    """One-line score: 'KC 14 @ BAL 10  5:23 - 2nd Quarter  [eventId]'"""
    a, h = g.get("awayTeam") or {}, g.get("homeTeam") or {}

    def side(t: Dict[str, Any]) -> str:
        name = t.get("abbreviation") or t.get("name") or "?"
        return name if t.get("score") is None else f"{name} {t['score']}"

    return f"{side(a)} @ {side(h)}  {(g.get('status') or {}).get('detail', '')}  [{g.get('id')}]"


def run(main) -> None:
    """Run main() and print API errors cleanly instead of a traceback."""
    try:
        main()
    except ApiError as e:
        print(e, file=sys.stderr)
        if e.hint:
            print(f"Hint: {e.hint}", file=sys.stderr)
        if e.status == 429:
            print(f"Monthly quota exhausted. Retry after {e.retry_after or '?'} s or upgrade.", file=sys.stderr)
        sys.exit(1)
    except requests.RequestException as e:
        sys.exit(f"Network error: {e}")
