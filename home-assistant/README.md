# Home Assistant live score sensors

Follow one team in Home Assistant: sensors for the game state, both scores, the opponent, the clock
and the start time, plus automations for a final-score notification and an optional goal light. A
single YAML package; no custom integration and no add-ons.

- One [RESTful](https://www.home-assistant.io/integrations/rest/) resource reads the league
  scoreboard (`GET /sports/{sport}/leagues/{league}/events`) and six template sensors pick your
  team's game out of it: a live game first, then the next upcoming one, then the last final.
- The resource doesn't poll by itself (`scan_interval: 86400`). Automations refresh it **every
  2 minutes while the game is on** (and from 10 minutes before the start) and **every 2 hours**
  otherwise, so quota is only spent when it matters.
- `rsa_game_final` notifies the final score. `rsa_team_scored` (off by default) fires on every
  score change; turn it on for low-scoring sports (NHL, NFL, soccer) to flash a light or play a horn.

| Sensor | Example |
| --- | --- |
| `sensor.rsa_game_state` | `pre`, `in`, `post`, or `none` (no game on the current scoreboard) |
| `sensor.rsa_team_score` / `sensor.rsa_opponent_score` | `1` / `0` (`unknown` before the start) |
| `sensor.rsa_opponent` | `@ CGY` or `vs CBJ` |
| `sensor.rsa_game_detail` | `13:12 - 2nd Period`, `Final`, `Tue, October 20th at 7:00 PM EDT` |
| `sensor.rsa_game_start` | timestamp (device class `timestamp`) |

Data is typically 20-30 seconds behind live play.

Step-by-step tutorial:
[Home Assistant live score sensors](https://www.realtimesportsapi.com/guides/home-assistant-live-scores?utm_source=github&utm_medium=realtime-sports-api-examples)

## Install

1. Get a free API key at
   [realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).
2. Add to `secrets.yaml` (see `secrets.yaml.example`):
   `rsa_api_auth: "Bearer YOUR_API_KEY"`
3. Enable packages in `configuration.yaml` if you haven't:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
4. Copy `packages/rsa_scores.yaml` into your config's `packages/` folder. Set the league in
   `resource:` (default NBA) and the team in `input_text.rsa_team` (default `BOS`; you can also change
   it later from the UI). Restart Home Assistant.
5. Optional: paste `dashboard-card.yaml` into a manual dashboard card.

League paths: `basketball/leagues/nba`, `hockey/leagues/nhl`, `football/leagues/nfl`,
`baseball/leagues/mlb`, `football/leagues/college-football`, `basketball/leagues/mens-college-basketball`,
`soccer/leagues/eng.1` (Premier League), `soccer/leagues/usa.1` (MLS). Team abbreviations are as
the API returns them (`BOS`, `CAR`, `KC`); look them up on the
[team API pages](https://www.realtimesportsapi.com/apis?utm_source=github&utm_medium=realtime-sports-api-examples).

The scoreboard covers the current window (roughly today and the next day), so between games the
state is `none` until your team's next game appears.

## Test the templates

```bash
pip install jinja2 pyyaml
python -m unittest discover -s tests -v
```

The tests load the package and render every sensor template against a real NHL scoreboard response
captured on 18 Oct 2026 (live game, final, upcoming, no game). The automations use Home Assistant
helpers (`as_datetime`, `is_number`, `now()`), so check them in Developer tools > Template.

## Quota usage

As of October 2026: Free 125 calls/month (1,000 during your first 30 days), Starter 10,000
([pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).
Every refresh is one call, whatever the number of sensors.

| Pattern | Calls |
| --- | --- |
| Idle refresh every 2 hours | ~12 a day, ~360 a month |
| One NBA/NHL game (10 min before + ~2.5 h at 2 min) | ~80 |
| One NBA or NHL team, ~14 games a month | ~1,500 per month (Starter) |
| One NFL team, ~4 games a month (~3.5 h each) | ~800 per month |

On the Free plan's 125 calls a month, set the idle refresh to `hours: "/12"` and turn off
`rsa_refresh_while_live`: you get the next game and final scores, not live updates.
