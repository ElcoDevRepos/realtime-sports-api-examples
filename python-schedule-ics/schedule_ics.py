#!/usr/bin/env python3
"""Put a team's season schedule in your calendar: writes an .ics file (Google Calendar, Apple
Calendar, Outlook) from the Realtime Sports API team-season endpoint.

Off-season is when next season's schedule lands; re-run the script whenever you like to pick up
start times as leagues announce them (import into a fresh calendar, or subscribe to the file).

Usage:
  python schedule_ics.py --league mlb --team NYY --season 2027
  python schedule_ics.py --league nba --team LAL --season 2027 --no-preseason   # the 2026-27 season
  python schedule_ics.py --league nhl --team "maple leafs" --season 2027 --out leafs.ics

--team takes the abbreviation (NYY), the team id, or the start of a name ("yankees").
Costs one call to look up the team, plus one per 25 games (a full MLB season is about 8 calls).
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import requests

API_BASE = os.environ.get("RSA_API_BASE", "https://www.realtimesportsapi.com/api/v1")
SPORT = {"nfl": "football", "college-football": "football", "nba": "basketball", "wnba": "basketball",
         "mens-college-basketball": "basketball", "mlb": "baseball", "nhl": "hockey"}
EASTERN = ZoneInfo("America/New_York")
LENGTH_HOURS = {"football": 3.5, "basketball": 2.5, "baseball": 3.0, "hockey": 2.5}


def load_dotenv(*paths: Path) -> None:
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def api_get(path: str, key: str, **params: Any) -> Dict[str, Any]:
    res = requests.get(API_BASE + path, params={k: v for k, v in params.items() if v is not None},
                       headers={"Authorization": f"Bearer {key}"}, timeout=30)
    if not res.ok:
        try:
            err = res.json().get("error") or {}
        except ValueError:
            err = {}
        sys.exit(f"HTTP {res.status_code} {err.get('code', '')}: {err.get('message', res.text[:200])}")
    return res.json()


def find_team(sport: str, league: str, wanted: str, key: str) -> Dict[str, Any]:
    teams: List[Dict[str, Any]] = []
    page = 1
    while True:
        j = api_get(f"/sports/{sport}/leagues/{league}/teams", key, page=page, limit=100)
        teams += j.get("data") or []
        pg = (j.get("meta") or {}).get("pagination") or j.get("pagination") or {}
        if page >= int(pg.get("pageCount") or 1):
            break
        page += 1
    w = wanted.lower()
    for t in teams:
        if w in (str(t.get("id")), str(t.get("abbreviation", "")).lower()):
            return t
    for t in teams:
        if any(str(t.get(f, "")).lower().startswith(w) for f in ("displayName", "name", "location", "shortDisplayName")):
            return t
    sys.exit(f"No {league} team matches {wanted!r}.")


def season_events(sport: str, league: str, season: int, team_id: str, key: str) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    page = 1
    while True:
        j = api_get(f"/sports/{sport}/leagues/{league}/seasons/{season}/teams/{team_id}/events", key, page=page)
        events += j.get("data") or []
        pg = (j.get("meta") or {}).get("pagination") or {}
        if page >= int(pg.get("pageCount") or 1):
            return events
        page += 1


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line: str) -> str:
    """RFC 5545: lines over 75 octets continue on the next line after a space."""
    out, b = [], line.encode()
    while len(b) > 75:
        cut = 75
        while (b[cut] & 0xC0) == 0x80:  # don't split a UTF-8 character
            cut -= 1
        out.append(b[:cut].decode()); b = b" " + b[cut:]
    out.append(b.decode())
    return "\r\n".join(out)


def time_announced(start: datetime) -> bool:
    """Games without an announced start time come back at exactly midnight US Eastern."""
    et = start.astimezone(EASTERN)
    return not (et.hour == 0 and et.minute == 0)


def to_ics(events: List[Dict[str, Any]], cal_name: str, sport: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//realtime-sports-api-examples//schedule-ics//EN",
             "CALSCALE:GREGORIAN", f"X-WR-CALNAME:{esc(cal_name)}"]
    for e in events:
        start = datetime.strptime(e["date"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        kind = ((e.get("season") or {}).get("type") or {}).get("name") or ""
        venue = e.get("venue") or {}
        where = ", ".join(x for x in (venue.get("name"), venue.get("city"), venue.get("state")) if x)
        tv = ", ".join(b.get("network", "") for b in (e.get("broadcasts") or []) if b.get("network"))
        desc = "\n".join(x for x in (kind, f"TV/streaming: {tv}" if tv else "", "Times can change: re-run the script to refresh.") if x)
        lines += ["BEGIN:VEVENT", f"UID:{e['id']}@realtimesportsapi-schedule-ics", f"DTSTAMP:{stamp}"]
        summary = e.get("name") or e.get("shortName") or "Game"
        if time_announced(start):
            end = start + timedelta(hours=LENGTH_HOURS.get(sport, 3))
            lines += [f"DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}", f"DTEND:{end.strftime('%Y%m%dT%H%M%SZ')}"]
        else:
            day = start.astimezone(EASTERN).date()  # the game's date (midnight Eastern)
            lines += [f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{(day + timedelta(days=1)).strftime('%Y%m%d')}"]
            summary += " (time TBA)"
        lines += [fold(f"SUMMARY:{esc(summary)}")]
        if where:
            lines.append(fold(f"LOCATION:{esc(where)}"))
        lines += [fold(f"DESCRIPTION:{esc(desc)}"), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"), Path.cwd() / ".env")
    key = os.environ.get("REALTIME_SPORTS_API_KEY")
    if not key:
        sys.exit("Set REALTIME_SPORTS_API_KEY (or put it in .env). Free key: https://www.realtimesportsapi.com/signup")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--league", required=True, choices=sorted(SPORT))
    ap.add_argument("--team", required=True)
    ap.add_argument("--season", required=True, type=int, help="season year; for seasons that cross New Year it is the year the season ENDS (NBA/NHL 2027 = the 2026-27 season)")
    ap.add_argument("--no-preseason", action="store_true", help="skip preseason / spring training games (postseason games stay)")
    ap.add_argument("--out", help="output file (default <TEAM>-<season>.ics)")
    a = ap.parse_args()

    sport = SPORT[a.league]
    team = find_team(sport, a.league, a.team, key)
    events = season_events(sport, a.league, a.season, str(team["id"]), key)
    if a.no_preseason:
        events = [e for e in events if (((e.get("season") or {}).get("type") or {}).get("abbreviation") or "") not in ("pre",)]
    if not events:
        sys.exit(f"No {a.season} games for {team.get('displayName')} yet. Schedules appear once the league publishes them.")
    tba = sum(not time_announced(datetime.strptime(e["date"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)) for e in events)
    out = a.out or f"{team.get('abbreviation', team['id'])}-{a.season}.ics"
    Path(out).write_text(to_ics(events, f"{team.get('displayName')} {a.season}", sport), newline="")
    print(f"Wrote {len(events)} games to {out} ({len(events) - tba} with a start time, {tba} time TBA): "
          f"first {events[0]['date'][:10]}, last {events[-1]['date'][:10]}")


if __name__ == "__main__":
    main()
