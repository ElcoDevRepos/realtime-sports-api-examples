#!/usr/bin/env python3
"""Live scoreboard for a terminal or an RGB LED matrix, powered by the Realtime Sports API.

Polls with quota-friendly intervals:
  * while a game is live:  events/live every --live-interval seconds (default 45)
  * when nothing is live:  the league's events endpoint (current scoreboard/schedule window: recent
    finals, live and upcoming games) every --idle-interval seconds (default 900 = 15 min), or sleep
    until shortly before the next scheduled game (max 6 h)

Examples:
  python scoreboard.py --sport football --league nfl --team KC
  python scoreboard.py --sport soccer --league eng.1
  python scoreboard.py --demo --once          # no API key needed, renders sample data
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Protocol

# --------------------------------------------------------------------------------- config


def load_dotenv(path: Path) -> None:
    """Tiny .env loader (KEY=value). Existing environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


@dataclass
class Settings:
    sport: str
    league: str
    team: Optional[str]
    live_interval: float
    idle_interval: float
    max_idle: float
    renderer: str
    once: bool
    demo: bool
    rows: int
    cols: int
    font: Optional[str]


# --------------------------------------------------------------------------------- model


@dataclass
class Line:
    away: str
    away_score: Optional[int]
    home: str
    home_score: Optional[int]
    status: str
    state: str  # pre | in | post


def team_label(team: Optional[Dict[str, Any]]) -> str:
    team = team or {}
    return str(team.get("abbreviation") or team.get("shortDisplayName") or team.get("name") or "?")[:4]


def involves(event: Dict[str, Any], team: Optional[str]) -> bool:
    if not team:
        return True
    want = team.strip().lower()
    for side in ("homeTeam", "awayTeam"):
        t = event.get(side) or {}
        if any(str(t.get(k, "")).lower() == want for k in ("abbreviation", "id", "name", "displayName")):
            return True
    return False


def local_time(iso: Optional[str]) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso
    return dt.astimezone().strftime("%a %-I:%M %p") if sys.platform != "win32" else dt.astimezone().strftime("%a %I:%M %p")


def to_line(event: Dict[str, Any]) -> Line:
    status = event.get("status") or {}
    state = status.get("state") or "pre"
    away, home = event.get("awayTeam") or {}, event.get("homeTeam") or {}
    if state == "pre":
        text = local_time(event.get("date"))
    else:
        text = status.get("detail") or ("Final" if state == "post" else "")
    return Line(
        away=team_label(away),
        away_score=away.get("score") if state != "pre" else None,
        home=team_label(home),
        home_score=home.get("score") if state != "pre" else None,
        status=text,
        state=state,
    )


def next_start(events: Iterable[Dict[str, Any]], now: Optional[float] = None) -> Optional[float]:
    """Earliest future start time (epoch seconds) among pre-game events."""
    now = time.time() if now is None else now
    best: Optional[float] = None
    for e in events:
        if (e.get("status") or {}).get("state") != "pre" or not e.get("date"):
            continue
        try:
            t = datetime.fromisoformat(str(e["date"]).replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        if t > now and (best is None or t < best):
            best = t
    return best


def idle_sleep(next_start_ts: Optional[float], idle_interval: float, max_idle: float, now: Optional[float] = None) -> float:
    """Idle interval, or sleep until ~2 minutes before a distant next game (capped at max_idle)."""
    now = time.time() if now is None else now
    if next_start_ts is None:
        return idle_interval
    until = next_start_ts - now - 120
    if until <= idle_interval:
        return idle_interval
    return min(until, max_idle)


# --------------------------------------------------------------------------------- renderers


class Renderer(Protocol):
    def render(self, title: str, lines: List[Line], footer: str) -> None: ...


class TerminalRenderer:
    def render(self, title: str, lines: List[Line], footer: str) -> None:
        width = min(shutil.get_terminal_size((60, 20)).columns, 60)
        out = ["\033[2J\033[H" if sys.stdout.isatty() else "", "+" + "-" * (width - 2) + "+"]

        def row(text: str) -> str:
            return "| " + text[: width - 4].ljust(width - 4) + " |"

        out.append(row(title))
        out.append("+" + "-" * (width - 2) + "+")
        if not lines:
            out.append(row("No games to show"))
        for ln in lines:
            if ln.state == "pre":
                score = f"{ln.away:>4}  @  {ln.home:<4}"
            else:
                score = f"{ln.away:>4} {ln.away_score if ln.away_score is not None else '-':>3} - {ln.home_score if ln.home_score is not None else '-':<3} {ln.home:<4}"
            marker = "*" if ln.state == "in" else " "
            out.append(row(f"{marker} {score}  {ln.status}"))
        out.append("+" + "-" * (width - 2) + "+")
        out.append(row(footer))
        out.append("+" + "-" * (width - 2) + "+")
        print("\n".join(out), flush=True)


class MatrixRenderer:
    """Stub renderer for hzeller/rpi-rgb-led-matrix (Raspberry Pi). Shows one game at a time."""

    def __init__(self, rows: int = 32, cols: int = 64, font: Optional[str] = None) -> None:
        try:
            from rgbmatrix import RGBMatrix, RGBMatrixOptions, graphics  # type: ignore[import-not-found]
        except ImportError as exc:
            raise SystemExit(
                "The matrix renderer needs the rpi-rgb-led-matrix Python bindings "
                "(https://github.com/hzeller/rpi-rgb-led-matrix). Use --renderer terminal elsewhere."
            ) from exc
        options = RGBMatrixOptions()
        options.rows, options.cols = rows, cols
        options.hardware_mapping = "adafruit-hat"  # adjust for your HAT/bonnet
        self._graphics = graphics
        self._matrix = RGBMatrix(options=options)
        self._canvas = self._matrix.CreateFrameCanvas()
        self._font = graphics.Font()
        self._font.LoadFont(font or "/usr/local/share/rgbmatrix/fonts/6x10.bdf")
        self._white = graphics.Color(255, 255, 255)
        self._amber = graphics.Color(255, 160, 0)
        self._index = 0

    def render(self, title: str, lines: List[Line], footer: str) -> None:
        g, c = self._graphics, self._canvas
        c.Clear()
        if not lines:
            g.DrawText(c, self._font, 1, 10, self._white, "NO GAMES")
        else:
            ln = lines[self._index % len(lines)]
            self._index += 1
            top = f"{ln.away} {'' if ln.away_score is None else ln.away_score}"
            bottom = f"{ln.home} {'' if ln.home_score is None else ln.home_score}"
            g.DrawText(c, self._font, 1, 10, self._white, top)
            g.DrawText(c, self._font, 1, 20, self._white, bottom)
            g.DrawText(c, self._font, 1, 30, self._amber, ln.status[:10])
        self._canvas = self._matrix.SwapOnVSync(c)


# --------------------------------------------------------------------------------- data sources


def demo_events() -> List[Dict[str, Any]]:
    soon = datetime.fromtimestamp(time.time() + 3 * 3600, tz=timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    return [
        {"id": "1", "status": {"state": "in", "detail": "5:23 - 2nd"}, "awayTeam": {"abbreviation": "KC", "score": 14}, "homeTeam": {"abbreviation": "BAL", "score": 10}},
        {"id": "2", "status": {"state": "post", "detail": "Final"}, "awayTeam": {"abbreviation": "DAL", "score": 20}, "homeTeam": {"abbreviation": "NYG", "score": 23}},
        {"id": "3", "date": soon, "status": {"state": "pre"}, "awayTeam": {"abbreviation": "SF"}, "homeTeam": {"abbreviation": "SEA"}},
    ]


def run(settings: Settings) -> None:
    renderer: Renderer
    if settings.renderer == "matrix":
        renderer = MatrixRenderer(settings.rows, settings.cols, settings.font)
    else:
        renderer = TerminalRenderer()
    title = f"{settings.league.upper()}{' - ' + settings.team.upper() if settings.team else ''}"

    if settings.demo:
        events = demo_events()
        renderer.render(title + " (demo)", [to_line(e) for e in events], "Demo data. Live: every 45 s, idle: 15 min")
        return

    key = os.environ.get("REALTIME_SPORTS_API_KEY", "").strip()
    if not key or key == "your_api_key_here":
        raise SystemExit(
            "Set REALTIME_SPORTS_API_KEY (see .env.example), or try --demo. "
            "Get a free key at https://www.realtimesportsapi.com/signup"
        )

    from realtime_sports_api import Client, RealtimeSportsError

    calls = 0
    live_mode = False  # start with the scoreboard window; it also contains live games
    with Client(base_url=os.environ.get("RSA_BASE_URL")) as client:  # RSA_BASE_URL only for local testing
        while True:
            now = time.time()
            try:
                live: List[Dict[str, Any]] = []
                if live_mode:
                    # 1 call per cycle while something is live.
                    live = [e for e in client.list_live_events(settings.sport, settings.league) if involves(e, settings.team)]
                    calls += 1
                    live_mode = bool(live)
                if not live_mode:
                    # 1 call per idle cycle: recent finals, live and upcoming games in the scoreboard window.
                    events = [e for e in client.list_events(settings.sport, settings.league) if involves(e, settings.team)]
                    calls += 1
                    live = [e for e in events if (e.get("status") or {}).get("state") == "in"]
                    live_mode = bool(live)
                if live_mode:
                    renderer.render(title, [to_line(e) for e in live], f"LIVE - next update in {int(settings.live_interval)} s - calls this run: {calls}")
                    wait = settings.live_interval
                else:
                    upcoming = sorted((e for e in events if (e.get("status") or {}).get("state") == "pre"), key=lambda e: e.get("date") or "")
                    finals = [e for e in events if (e.get("status") or {}).get("state") == "post"]
                    lines = [to_line(e) for e in (finals[-3:] + upcoming[:5])]
                    wait = idle_sleep(next_start(events, now), settings.idle_interval, settings.max_idle, now)
                    renderer.render(title, lines, f"Nothing live - next check in {int(wait // 60)} min - calls this run: {calls}")
            except RealtimeSportsError as e:
                if e.is_rate_limited:
                    wait = min(e.retry_after or 3600, 6 * 3600)
                    renderer.render(title, [], f"Monthly quota exhausted - retry in {int(wait // 60)} min")
                elif e.is_auth_error:
                    raise SystemExit(f"Auth failed ({e.code}): {e.message}")
                else:
                    wait = settings.live_interval
                    renderer.render(title, [], f"Error: {e.code} - retrying in {int(wait)} s")
            if settings.once:
                return
            time.sleep(wait)


def parse_args(argv: Optional[List[str]] = None) -> Settings:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sport", default="football", help="football (American), basketball, baseball, hockey, soccer")
    p.add_argument("--league", default="nfl", help="nfl, college-football, nba, mens-college-basketball, mlb, nhl, eng.1, usa.1, ...")
    p.add_argument("--team", help="only show games for this team abbreviation or id (e.g. KC)")
    p.add_argument("--live-interval", type=float, default=45, help="seconds between polls while live (min 30, default 45)")
    p.add_argument("--idle-interval", type=float, default=900, help="seconds between polls when idle (default 900)")
    p.add_argument("--max-idle", type=float, default=6 * 3600, help="longest sleep before the next scheduled game (default 6 h)")
    p.add_argument("--renderer", choices=["terminal", "matrix"], default="terminal")
    p.add_argument("--rows", type=int, default=32, help="matrix rows (matrix renderer)")
    p.add_argument("--cols", type=int, default=64, help="matrix columns (matrix renderer)")
    p.add_argument("--font", help="BDF font path (matrix renderer)")
    p.add_argument("--once", action="store_true", help="fetch and render once, then exit")
    p.add_argument("--demo", action="store_true", help="render sample data without calling the API")
    a = p.parse_args(argv)
    return Settings(
        sport=a.sport,
        league=a.league,
        team=a.team,
        live_interval=max(30.0, a.live_interval),
        idle_interval=max(300.0, a.idle_interval),
        max_idle=max(a.idle_interval, a.max_idle),
        renderer=a.renderer,
        once=a.once,
        demo=a.demo,
        rows=a.rows,
        cols=a.cols,
        font=a.font,
    )


if __name__ == "__main__":
    load_dotenv(Path(__file__).with_name(".env"))
    try:
        run(parse_args())
    except KeyboardInterrupt:
        pass
