# Team schedule to your calendar (.ics) in Python

Guide: https://www.realtimesportsapi.com/guides/team-schedule-calendar-ics?utm_source=githubguides/team-schedule-calendar-icsutm_medium=realtime-sports-api-examples

Writes a team's season schedule from the Realtime Sports API to an `.ics` file you can import into Google Calendar, Apple Calendar or Outlook. Each game gets the opponent, venue and TV/streaming networks where listed. Games whose start time isn't announced yet become all-day events marked "time TBA". Re-run the script to pick up times as leagues announce them.

Leagues: NFL, college football, NBA, WNBA, men's college basketball, MLB, NHL.

## Run

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # REALTIME_SPORTS_API_KEY (free key: https://www.realtimesportsapi.com/signup?utm_source=githubsignup)utm_medium=realtime-sports-api-examples)

python schedule_ics.py --league mlb --team NYY --season 2027
python schedule_ics.py --league nba --team LAL --season 2027 --no-preseason   # the 2026-27 season
python schedule_ics.py --league nhl --team "maple leafs" --season 2027 --out leafs.ics
```

`--team` takes the abbreviation, the team id or the start of a name. `--season` is the season year; for seasons that cross New Year (NBA, NHL, college basketball) it is the year the season ends. Cost: 1 call to find the team plus 1 per 25 games (a full MLB season with spring training is 9 calls).
