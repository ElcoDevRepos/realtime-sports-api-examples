# Next.js live scoreboard

A minimal Next.js 14 (App Router) scoreboard: pick a league, see live, upcoming and final games,
refreshed every 60 seconds. The API key never leaves the server.

- `lib/rsa.js` calls `GET /sports/{sport}/leagues/{league}/events` with
  `fetch(url, { next: { revalidate: 30 } })`, so Next.js caches each league's scoreboard for 30 s.
  However many people have the page open, the app makes at most about two API calls per minute per
  league. Only an allowlist of leagues can be requested, so the route is not an open proxy.
- `app/api/scoreboard/route.js` is a route handler (`GET /api/scoreboard?league=nfl`) that returns a
  trimmed JSON scoreboard with `Cache-Control: s-maxage=30`.
- `app/page.js` is a server component that renders the first view on the server.
- `app/Scoreboard.js` is a client component that re-fetches `/api/scoreboard` every 60 s (and skips
  refreshes while the tab is hidden).

Data is aggregated from public sources and is typically 20-30 seconds behind live play.

Step-by-step tutorial:
[Build a live scoreboard with Next.js](https://www.realtimesportsapi.com/guides/nextjs-live-scoreboard?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

Requires Node 18.17+.

```bash
cd nextjs-scoreboard
npm install
cp .env.example .env.local   # put your key in REALTIME_SPORTS_API_KEY
```

Get a free key at
[realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).
The variable has no `NEXT_PUBLIC_` prefix on purpose: Next.js only exposes variables with that
prefix to the browser.

## Run

```bash
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

Open `http://localhost:3000/?league=nhl` (or `nfl`, `college-football`, `nba`,
`mens-college-basketball`, `mlb`, `eng.1`, `usa.1`). Add leagues in `LEAGUES` in `lib/rsa.js`.

On Vercel or any other Node host, set `REALTIME_SPORTS_API_KEY` in the project's environment
variables and deploy as a normal Next.js app.

## Example output

Captured from a real `npm run build && npm start` on 7 Oct 2026.

```bash
$ curl -s "http://localhost:3000/api/scoreboard?league=nhl"
```

```json
{"league":"nhl","sport":"hockey","name":"NHL","fetchedAt":"2026-10-07T15:15:30.683Z","games":[
 {"id":"401891830","date":"2026-10-07T23:30Z","shortName":"PIT @ WSH","state":"pre","detail":"Wed, October 7th at 7:30 PM EDT","venue":"Capital One Arena","home":{"abbr":"WSH","name":"Washington Capitals","score":0,"winner":false},"away":{"abbr":"PIT","name":"Pittsburgh Penguins","score":0,"winner":false}},
 {"id":"401892455","date":"2026-10-07T23:30Z","shortName":"COL @ WPG","state":"pre","detail":"Wed, October 7th at 7:30 PM EDT","venue":"Canada Life Centre","home":{"abbr":"WPG","name":"Winnipeg Jets","score":0,"winner":false},"away":{"abbr":"COL","name":"Colorado Avalanche","score":0,"winner":false}},
 ...]}
```

The page (`curl -s "http://localhost:3000/?league=nfl"`, tags stripped):

```
NFL scoreboard
Updated 15:15:31 UTC · refreshes every 60 s · data is typically 20-30 s behind live play
Upcoming (15)
TB  DAL   Thu, October 8th at 8:15 PM EDT · AT&T Stadium
PHI JAX   Sun, October 11th at 9:30 AM EDT · Tottenham Hotspur Stadium
CHI GB    Sun, October 11th at 1:00 PM EDT · Lambeau Field
```

Unknown leagues are rejected: `GET /api/scoreboard?league=foo` returns
`400 {"error":"Unknown league \"foo\""}`.

## Notes

- Before a game starts the API reports both scores as `0`; the page hides scores for `pre` games.
- The scoreboard endpoint returns the league's current window (for the NFL, the current week;
  for daily leagues, roughly today's games). For a specific week or date range use
  `GET /seasons/{season}/schedule`.
- Every upstream call counts toward your monthly quota (as of October 2026, the Free plan has 125
  calls a month, 1,000 in the first 30 days; see
  [pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).
  One tab left open all day costs about 1,440 calls per day (one refresh a minute); with many
  viewers the 30 s cache caps it at about 2,880 per league per day. On small plans, raise
  `REVALIDATE_SECONDS` and `REFRESH_MS`, or only refresh while games are live.
