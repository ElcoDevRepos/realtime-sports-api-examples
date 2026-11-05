# College football data in Python

Scores, box scores and play-by-play for NCAA FBS college football from the [Realtime Sports API](https://www.realtimesportsapi.com), in one small script that only needs `requests`.

Tutorial: https://www.realtimesportsapi.com/guides/college-football-api-python

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add your REALTIME_SPORTS_API_KEY (free key, no card)

python cfb.py scores                               # the current scoreboard (this week's games)
python cfb.py scores --date 2026-10-31 --team UGA  # one day, one team
python cfb.py box 401856734                        # passing, rushing, receiving lines
python cfb.py plays 401856734 --last 15            # how the game ended, play by play
```

Each command is one API call (`plays` makes two when a game has more than 100 plays). Data typically runs 20-30 seconds behind live play.
