# Soccer (football) data in Python

Fixtures and scores for the Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, MLS, Liga MX and the Champions League from the [Realtime Sports API](https://www.realtimesportsapi.com), in one small script that only needs `requests`.

Tutorial: https://www.realtimesportsapi.com/guides/soccer-api-python

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add your REALTIME_SPORTS_API_KEY (free key, no card)

python soccer.py scores                               # Premier League scoreboard
python soccer.py scores --league usa.1 --date 2026-11-01
python soccer.py leagues                              # league codes
```

One key covers every league.
