"""Pure helpers for the men's college basketball scoreboard and bracket tracker.

No network I/O except `api_get`, so everything else is unit tested (python -m unittest).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")
LEAGUE_PATH = "/sports/basketball/leagues/mens-college-basketball"

# Round labels as the tournament endpoint returns them, in bracket order. Matching is by substring,
# case-insensitive; anything unknown sorts last.
ROUND_ORDER = ["first four", "1st round", "2nd round", "sweet 16", "elite 8", "final four", "championship"]


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, retry_after: int | None = None):
        super().__init__(f"HTTP {status} {code}: {message}")
        self.status, self.code, self.retry_after = status, code, retry_after


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (KEY=value lines). Variables already in the environment win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def api_get(path: str, key: str, **query) -> dict:
    """GET a path under /api/v1 and return the envelope {success, data, meta}."""
    qs = urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
    req = urllib.request.Request(f"{API_BASE}{path}{'?' + qs if qs else ''}",
                                 headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e).get("error", {})
        except Exception:  # noqa: BLE001 - non-JSON error body
            err = {}
        ra = e.headers.get("Retry-After")
        raise ApiError(e.code, err.get("code", ""), err.get("message", "request failed"), int(ra) if ra and ra.isdigit() else None) from None


def label(team: dict | None) -> str:
    team = team or {}
    return team.get("abbreviation") or team.get("name") or "?"


def involves(game: dict, teams: list[str]) -> bool:
    """True when any of `teams` (abbreviations or ids, case-insensitive) plays. Empty list = every game."""
    if not teams:
        return True
    wanted = {t.lower() for t in teams}
    for side in ("homeTeam", "awayTeam"):
        t = game.get(side) or {}
        if str(t.get("id", "")).lower() in wanted or str(t.get("abbreviation", "")).lower() in wanted:
            return True
    return False


def game_line(game: dict) -> str:
    """'DUKE 71 - 68 UNC  (2:14 - 2nd Half)'; upcoming games show the start time instead of 0-0."""
    a, h = game.get("awayTeam") or {}, game.get("homeTeam") or {}
    status = game.get("status") or {}
    detail = status.get("detail") or ""
    if status.get("state") == "pre":
        return f"{label(a)} @ {label(h)}  ({detail})"
    return f"{label(a)} {a.get('score', 0)} - {h.get('score', 0)} {label(h)}  ({detail})"


def is_close(game: dict, margin: int = 5) -> bool:
    """A live game in the second half (or overtime) decided by `margin` points or fewer."""
    status = game.get("status") or {}
    if status.get("state") != "in" or (status.get("period") or 0) < 2:
        return False
    a = (game.get("awayTeam") or {}).get("score", 0) or 0
    h = (game.get("homeTeam") or {}).get("score", 0) or 0
    return abs(a - h) <= margin


def idle_seconds(events: list[dict], now: float, default: int, cap: int = 6 * 3600) -> int:
    """Seconds to sleep when nothing is live: until ~2 min before the next start, at least 5 min,
    at most `cap`. Falls back to `default` when no upcoming start is known."""
    starts = []
    for e in events:
        if (e.get("status") or {}).get("state") != "pre" or not e.get("date"):
            continue
        try:
            t = datetime.fromisoformat(e["date"].replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        if t > now:
            starts.append(t)
    if not starts:
        return default
    return int(min(max(min(starts) - now - 120, 300), cap))


def round_rank(round_label: str | None) -> int:
    r = (round_label or "").lower()
    for i, name in enumerate(ROUND_ORDER):
        if name in r:
            return i
    return len(ROUND_ORDER)


def winner(game: dict) -> str | None:
    """Winning team's label for a completed game, else None."""
    if not (game.get("status") or {}).get("completed"):
        return None
    a, h = game.get("awayTeam") or {}, game.get("homeTeam") or {}
    if a.get("winner") or (a.get("score", 0) > h.get("score", 0)):
        return label(a)
    if h.get("winner") or (h.get("score", 0) > a.get("score", 0)):
        return label(h)
    return None


def group_bracket(games: list[dict]) -> list[tuple[str, list[tuple[str, list[dict]]]]]:
    """Tournament games grouped as [(round, [(region, [games by date])])], rounds in bracket order.

    Final Four and championship games have no region; they are grouped under "National".
    """
    rounds: dict[str, dict[str, list[dict]]] = {}
    for g in games:
        t = g.get("tournament") or {}
        rnd = t.get("round") or "Unknown round"
        region = t.get("region") or "National"
        rounds.setdefault(rnd, {}).setdefault(region, []).append(g)
    out = []
    for rnd in sorted(rounds, key=round_rank):
        regions = [(reg, sorted(gs, key=lambda x: x.get("date") or "")) for reg, gs in sorted(rounds[rnd].items())]
        out.append((rnd, regions))
    return out


def render_bracket(games: list[dict]) -> str:
    lines = []
    for rnd, regions in group_bracket(games):
        lines.append(f"== {rnd} ==")
        for region, gs in regions:
            lines.append(f"  {region}")
            for g in gs:
                w = winner(g)
                lines.append(f"    {game_line(g)}{f'  -> {w}' if w else ''}")
    return "\n".join(lines)


def bracket_rows(games: list[dict]) -> list[dict]:
    """Flat rows for CSV export."""
    rows = []
    for rnd, regions in group_bracket(games):
        for region, gs in regions:
            for g in gs:
                a, h = g.get("awayTeam") or {}, g.get("homeTeam") or {}
                rows.append({
                    "round": rnd, "region": region, "date": g.get("date", ""), "event_id": g.get("id", ""),
                    "away": label(a), "away_score": a.get("score", 0), "home": label(h), "home_score": h.get("score", 0),
                    "status": (g.get("status") or {}).get("detail", ""), "winner": winner(g) or "",
                })
    return rows
