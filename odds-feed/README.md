# Odds feed with line-move detection

Builds a normalised JSON odds feed for a league's upcoming games: spread, moneyline and total, the
opening line, the margin-free implied win probability, and every line move recorded since the line
opened. Useful as the odds input for a fantasy app, a pick'em game or a model. Node 18+, no
dependencies.

For each upcoming game on the league scoreboard (`GET /sports/{sport}/leagues/{league}/events`) it
calls:

- `GET /events/{id}/odds`: the current line. `data` is `null` (with a `message`) when the book has
  no line for the game yet; the feed keeps the game with `"odds": null`.
- `GET /events/{id}/odds/history`: snapshots recorded each time the line changed. The script sorts
  them by timestamp, compares consecutive snapshots and lists the changes as `moves`.

Odds come from a **single source book** (named in `odds.provider`); this is not a multi-book
comparison. Data is typically 20-30 seconds behind live.

Step-by-step tutorial:
[Build a fantasy odds feed](https://www.realtimesportsapi.com/guides/fantasy-odds-feed?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

```bash
cd odds-feed
cp .env.example .env    # put your key in REALTIME_SPORTS_API_KEY
```

Get a free key at
[realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).

## Run

```bash
node feed.js football nfl                          # JSON feed to stdout, summary to stderr
node feed.js football college-football --limit 5   # first 5 upcoming games (default 8)
node feed.js basketball nba --out nba-feed.json    # write the feed to a file
npm test                                           # unit tests (normalising, implied odds, move detection)
```

Cost: 1 scoreboard call plus 2 calls per game with odds (1 when there are none). The default
`--limit 8` is at most 17 calls.

## Example output

Captured from a real run on 7 Oct 2026 (`node feed.js football nfl --limit 6`). The summary lines:

```
TB @ DAL  DAL -8.5  O/U 47.5  ML DAL -455 / TB +350  (spread -5 since open, total -5 since open)
PHI VS JAX  JAX +1.5  O/U 43.5  ML JAX +110 / PHI -130
CHI @ GB  GB -3  O/U 49.5  ML GB -166 / CHI +140
HOU @ TEN  TEN +3.5  O/U 43.5  ML TEN +154 / HOU -185
CIN @ MIA  MIA +6  O/U 49.5  ML MIA +225 / CIN -278
```

One game from the JSON feed (abridged):

```json
{
  "eventId": "401872980",
  "shortName": "TB @ DAL",
  "start": "2026-10-09T00:15Z",
  "home": { "id": "6", "abbreviation": "DAL", "name": "Dallas Cowboys" },
  "away": { "id": "27", "abbreviation": "TB", "name": "Tampa Bay Buccaneers" },
  "odds": {
    "provider": "DraftKings",
    "spread": { "line": -8.5, "home": -112, "away": -108 },
    "moneyline": { "home": -455, "away": 350 },
    "total": { "line": 47.5, "over": -115, "under": -105 },
    "impliedWin": { "home": 0.787, "away": 0.213 },
    "updatedAt": "2026-10-07T14:22:10.933Z"
  },
  "opening": { "spread": { "line": -3.5, "home": -110, "away": -110 }, "total": { "line": 52.5, "over": -110, "under": -110 }, "recordedAt": "2026-09-05T00:56:14.781Z" },
  "movement": {
    "spread": -5,
    "total": -5,
    "snapshots": 3,
    "moves": [
      { "market": "spread", "from": -3.5, "to": -8.5, "at": "2026-10-07T10:27:16.177Z" },
      { "market": "total", "from": 52.5, "to": 47.5, "at": "2026-10-07T10:27:16.177Z" },
      { "market": "moneyline.home", "from": -205, "to": -455, "at": "2026-10-07T10:27:16.177Z" },
      { "market": "moneyline.away", "from": 170, "to": 350, "at": "2026-10-07T10:27:16.177Z" }
    ],
    "lineMoved": true
  }
}
```

A game without odds (`node feed.js basketball mens-college-basketball`, same day):

```
ND VS VILL  no odds available
```

```json
{ "eventId": "401920982", "shortName": "ND VS VILL", "odds": null, "opening": null,
  "movement": { "spread": null, "total": null, "snapshots": 0, "moves": [], "lineMoved": false } }
```

## Field notes

- `spread.line` is from the **home** team's point of view: `-8.5` means the home team is favoured
  by 8.5. `spread.home` / `spread.away` are the prices (American odds) on each side.
- `impliedWin` converts the two moneylines to probabilities and removes the book's margin so they
  sum to 1. It is left `null` for soccer, where the moneyline has no draw price.
- Sort history by `timestamp` yourself: snapshots are not guaranteed to arrive in order, and the
  same line can be recorded twice a few milliseconds apart. The current `/odds` line can also be
  newer than the last history snapshot; the script compares it with the last snapshot too.
- Many games have a single snapshot (no moves yet). `provider` can be `"Unknown"` on some events.
- To react to moves as they happen instead of polling, subscribe to `event_odds_change` over the
  WebSocket stream (paid plans; the Free plan includes a 500-message monthly preview).
