# Historical soccer results in Python: season-by-season records and head-to-heads

Guide: https://www.realtimesportsapi.com/guides/soccer-history-python?utm_source=githubguides/soccer-history-pythonutm_medium=realtime-sports-api-examples

A command-line script for the Realtime Sports API's historical results endpoints. On every plan, including Free:

- `seasons`: a club's league position, record, goals and points for every season on file
- `h2h`: every league meeting between two clubs, with the W/D/L tally

Covers the Premier League, Championship, LaLiga, Serie A, Bundesliga, Ligue 1, Liga MX and the Champions League, back to 2010-11 for most of them. This is historical data, updated periodically and never live; for live scores use the events endpoints.

## Run

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # REALTIME_SPORTS_API_KEY (free key: https://www.realtimesportsapi.com/signup?utm_source=githubsignup)utm_medium=realtime-sports-api-examples)

python history.py seasons arsenal
python history.py seasons barcelona --league esp.1 --since 2015-16
python history.py h2h arsenal tottenham --csv h2h.csv
```

Teams: a slug (`arsenal-fc`) or the start of a name (`"manchester united"`). Cost: 1 call for the season list plus 1 per season read (a full Premier League history is 18 calls).

Tables are computed from the results (3 points a win, no deductions), so they can differ from official tables where points were deducted. A season with results still missing on file is marked "not complete". The Champions League has no single table, so `seasons` skips it; `h2h` works there.
