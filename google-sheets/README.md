# Google Sheets custom functions

One Apps Script file, [`Code.gs`](Code.gs), that adds Realtime Sports API functions to a Google
Sheet:

| Formula | Returns | Cached for |
| --- | --- | --- |
| `=RSA_LIVE("football", "nfl")` | Games in progress: away, score, home, score, status, event id | 60 s |
| `=RSA_SCHEDULE("football", "nfl", 2026, 5)` | Season schedule; optional `week` (NFL and college football) and `seasonType` (1 pre, 2 regular, 3 post) | 1 h |
| `=RSA_EVENTS("basketball", "nba")` | Current scoreboard window: recent results, live and upcoming games | 5 min |
| `=RSA_TEAMS("hockey", "nhl")` | Team id, abbreviation, name (up to 5 pages of 100) | 24 h |
| `=RSA_QUOTA()` | Calls remaining this month, monthly limit, reset time | 5 min |

Each function returns a 2D array with a header row, so it spills into the cells below and to the
right. Times are returned as dates in your spreadsheet's time zone. No logos or images.

Data is aggregated from public sources and is typically 20-30 seconds behind live play.

## Setup

1. Open a Google Sheet, then **Extensions > Apps Script**.
2. Replace the contents of `Code.gs` with this repository's [`Code.gs`](Code.gs) and click **Save**.
3. Reload the spreadsheet. A **Realtime Sports API** menu appears (it can take a few seconds).
4. **Realtime Sports API > Set API key...** and paste your key (free at
   [realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples)). Google asks you to authorize the script the first
   time: it needs to show a dialog, store your key and call `www.realtimesportsapi.com`.
5. **Realtime Sports API > Test connection** to check it works.
6. Type a formula, e.g. `=RSA_LIVE("football", "nfl")` in an empty cell.

Sport slugs: `football` (American), `basketball`, `baseball`, `hockey`, `soccer`. League slugs:
`nfl`, `college-football`, `nba`, `mens-college-basketball`, `mlb`, `nhl`, and soccer such as `eng.1`,
`usa.1`, `uefa.champions`.

### Where the key is stored

The key is saved with `PropertiesService.getUserProperties()`: it is not written into any cell and
other people viewing the sheet cannot see it. Apps Script runs custom functions with the
**spreadsheet owner's** user properties, so set the key while signed in as the owner. Anyone you
give edit access to can edit the script itself, so only share edit access with people you would
trust with the key. **Remove API key** in the menu deletes it.

## Refreshing

Google Sheets re-runs a custom function only when its arguments change or the sheet is reopened,
and it does not allow `NOW()` as an argument. To refresh on demand:

1. Create a named range called `RSA_REFRESH` on any spare cell (**Data > Named ranges**).
2. Pass it as the last argument: `=RSA_LIVE("football", "nfl", RSA_REFRESH)` or
   `=RSA_EVENTS("basketball", "nba", RSA_REFRESH)`.
3. Use **Realtime Sports API > Refresh now**: it clears the cache and writes the current time into
   `RSA_REFRESH`, which makes those formulas recalculate.

If you want automatic refreshes, add a time-driven trigger for `rsaRefreshNow` (**Triggers > Add
Trigger > Time-driven**). Keep it at 5 minutes or slower, and only during game windows, unless you
have quota to spare (see below).

## Quota usage

Each formula that misses the cache makes one API call (`RSA_TEAMS` can make up to 5 for big college
leagues). Recalculations within the cache window are free, and identical formulas share one cache
entry. Monthly quotas as of October 2026 (see [pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples) for current ones): Free 125 calls (1,000 in the first 30 days), Starter 10,000, Growth 25,000,
Pro 50,000, Scale 500,000.

| Usage | Calls |
| --- | --- |
| Opening a sheet with one `RSA_LIVE` and one `RSA_SCHEDULE` | up to 2 |
| Refresh trigger every 5 min with one `RSA_LIVE`, during a 3.5-hour game window | ~42 per window |
| Same trigger every 5 min around the clock | ~288 per day (~8,600 per month) |
| 18 `RSA_SCHEDULE` cells (one per NFL week), sheet opened | up to 18 per open, at most once per hour |

So a manually refreshed sheet fits the Free plan, a game-day sheet with a 5-minute trigger fits
Starter, and an always-on 5-minute trigger needs Starter or above. Avoid pointing many cells at
`RSA_QUOTA()`; it costs a call on every refresh too.

## Troubleshooting

- `No API key...`: use the menu to set it (as the spreadsheet owner).
- `Monthly quota exhausted`: the API returned 429. Wait for the monthly reset or upgrade.
- `Loading...` forever or `Exceeded maximum execution time`: Apps Script limits custom functions to
  30 seconds; try again, the next run usually hits the cache.
- Results look stale: use **Refresh now**, or check that the formula references `RSA_REFRESH`.
