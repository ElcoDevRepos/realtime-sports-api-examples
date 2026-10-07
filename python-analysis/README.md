# Sports data analysis with Python and pandas

Pulls every completed game of a season from the Realtime Sports API into a pandas DataFrame and
computes, per team: record, win percentage, points for and against, points per game, average
margin, and home vs away records. League-wide it reports the home win rate, average margin of
victory, average total points, the share of one-score games and the highest-scoring game. Results
are written to two CSV files.

It uses the season schedule endpoint one week at a time,
`GET /sports/football/leagues/{league}/seasons/{season}/schedule?week=N&seasonType=2`, so it works
for the NFL and college football (the leagues with weeks). Each week is one API call: a full NFL
regular season is 18 calls. When it reaches a week with no completed games it stops early.

Step-by-step tutorial:
[Sports data analysis with Python](https://www.realtimesportsapi.com/guides/python-sports-data-analysis?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

Python 3.10+.

```bash
cd python-analysis
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # put your key in REALTIME_SPORTS_API_KEY
```

Get a free key at
[realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).
The script also reads `REALTIME_SPORTS_API_KEY` from the environment or from the repo-root `.env`.

## Run

```bash
python analyze.py                                    # NFL 2025 regular season, weeks 1-18
python analyze.py --season 2026 --weeks 1-18         # current season so far (stops at the first unplayed week)
python analyze.py --league college-football --season 2025 --weeks 1-15
python analyze.py --out-dir data                     # where the CSVs go (default: current directory)
```

Outputs `games_<league>_<season>.csv` (one row per game) and `standings_<league>_<season>.csv` (one
row per team).

## Example output

Captured from a real run on 7 Oct 2026 (`python analyze.py`, 18 API calls):

```
week  1:  16 games,  16 completed
...
week 18:  16 games,  16 completed

NFL 2025: 272 completed games

      wins  losses  ties  win_pct   ppg  opp_ppg  avg_margin home_record away_record
team
SEA     14       3     0    0.824  28.4     17.2        11.2         6-2         8-1
NE      14       3     0    0.824  28.8     18.8        10.0         6-3         8-0
DEN     14       3     0    0.824  23.6     18.3         5.3         8-1         5-2
JAX     13       4     0    0.765  27.9     19.8         8.1         7-1         6-2
LAR     12       5     0    0.706  30.5     20.4        10.1         7-1         4-4

League-wide:
  games                272
  home_win_rate        0.538
  avg_margin           11.2
  avg_total_points     46.0
  one_score_games_pct  0.533
  highest_scoring      CHI 47 @ CIN 42 (week 9)
```

`standings_nfl_2025.csv`:

```
team,games,wins,losses,ties,points_for,points_against,ppg,opp_ppg,avg_margin,win_pct,home_record,home_win_pct,away_record,away_win_pct
SEA,17,14,3,0,483,292,28.4,17.2,11.2,0.824,6-2,0.75,8-1,0.889
NE,17,14,3,0,490,320,28.8,18.8,10.0,0.824,6-3,0.667,8-0,1.0
```

## How it works

1. `fetch_games` turns each event into a flat row (`home`, `away`, `home_score`, `away_score`,
   `completed`, `neutral_site`, ...) and keeps only completed games.
2. `team_games` reshapes the games into "long" format, one row per team per game, so every stat is
   a simple `groupby("team")`.
3. Neutral-site games (for example international games) count toward the overall record but not
   toward the home or away split, which is why a team's home and away records can add up to one
   game fewer than its total.

## Notes

- `home_win_rate` excludes ties and neutral-site games.
- A "one-score game" here means a final margin of 8 points or fewer.
- For leagues without weeks (NBA, MLB, NHL, soccer), the schedule endpoint without `week` returns
  at most 200 events, so it can't cover a full season in one call. To analyse those leagues, page
  through `GET /seasons/{season}/teams/{teamId}/events` per team instead (more calls).
