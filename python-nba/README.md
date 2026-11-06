# NBA data in Python

Scores, box scores and play-by-play for the NBA from the [Realtime Sports API](https://www.realtimesportsapi.com), in one small script that only needs `requests`.

Tutorial: https://www.realtimesportsapi.com/guides/nba-api-python

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add your REALTIME_SPORTS_API_KEY (free key, no card)

python nba.py scores --date 2026-11-04   # a day's games, with event ids
python nba.py box 401909922              # every player's line
python nba.py plays 401909922            # the last 15 plays (--all for the whole game)
```

Data typically runs 20-30 seconds behind live play.
