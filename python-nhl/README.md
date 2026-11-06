# NHL data in Python

Scores, goals and injury reports for the NHL from the [Realtime Sports API](https://www.realtimesportsapi.com), in one small script that only needs `requests`.

Tutorial: https://www.realtimesportsapi.com/guides/nhl-api-python

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add your REALTIME_SPORTS_API_KEY (free key, no card)

python nhl.py scores --date 2026-11-04   # a day's games, with event ids
python nhl.py goals 401892644            # every goal, with the score after it
python nhl.py injuries                   # league-wide injury report
```

Data typically runs 20-30 seconds behind live play. For goal alerts pushed to you, see `../nhl-goal-alerts`.
