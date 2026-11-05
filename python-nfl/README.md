# NFL data in Python

Scores, box scores and injury reports for the NFL from the [Realtime Sports API](https://www.realtimesportsapi.com), in one small script that only needs `requests`.

Tutorial: https://www.realtimesportsapi.com/guides/nfl-api-python

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add your REALTIME_SPORTS_API_KEY (free key, no card)

python nfl.py scores                         # this week's games
python nfl.py scores --season 2026 --week 8  # a past week
python nfl.py box 401873023                  # passing, rushing, receiving lines
python nfl.py injuries --team 9              # one team's full injury report
```

Each command is one API call. Data typically runs 20-30 seconds behind live play.
