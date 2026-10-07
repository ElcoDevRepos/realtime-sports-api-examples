# Sports stats newsletter

Builds a recap newsletter for a league (final scores, top performers from the box scores, and the
upcoming games) and writes it as **Markdown** and **email-ready HTML** (inline styles, no images, a
single table layout) that you can paste into Mailchimp, Buttondown, Beehiiv, Substack, an SMTP
script or any other email tool. Node 18+, no dependencies. It never sends email itself: every run
is a dry run that writes files.

- **Weekly mode** (`nfl`, `college-football`): reads the current week from the scoreboard, recaps
  the previous week with `GET /seasons/{season}/schedule?week=N`, and lists this week's games.
- **Daily mode** (every other league): uses the finals and upcoming games on the current
  scoreboard (`GET /events`).
- **Top performers**: `GET /events/{id}/boxscore` for each final (up to `--boxscores`, default 16),
  then the top three across the week: passing, rushing and receiving yards for football; points,
  rebounds and assists for basketball; RBIs and hits for baseball; goals (and assists) for hockey and
  soccer when the box score has them. Games with no box score are skipped.

Step-by-step tutorial:
[Build a sports stats newsletter](https://www.realtimesportsapi.com/guides/sports-stats-newsletter?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

```bash
cd newsletter
cp .env.example .env    # put your key in REALTIME_SPORTS_API_KEY
```

Get a free key at
[realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).

## Run

```bash
node recap.js                                    # NFL weekly recap -> out/recap-nfl-<date>.md and .html
node recap.js --league college-football --boxscores 10
node recap.js --sport basketball --league nba    # daily recap
node recap.js --out-dir newsletters              # output folder (default: out)
npm test                                         # unit tests for leaders and rendering
```

Cost per run: 2 calls plus one per box score in weekly mode (a full NFL week is 18 calls), 1 plus
one per box score in daily mode. Schedule it with cron, e.g. every Tuesday morning for the NFL:
`0 9 * * 2 cd /path/to/newsletter && node recap.js`.

## Example output

Captured from a real run on 7 Oct 2026 (`node recap.js`, 18 API calls), abridged:

```markdown
# NFL Week 4 recap

_16 finals, 15 upcoming · generated 2026-10-07_

## Final scores

- PIT 24 @ **CLE 27**
- **IND 30** @ WSH 13
- ARI 24 @ **NYG 36**
- **DAL 34** @ HOU 30
...

## Top performers

**Passing**

- Joe Burrow (CIN): 428 yds, 1 TD
- Jared Goff (DET): 412 yds, 1 TD
- Kirk Cousins (LV): 365 yds, 2 TD

**Rushing**

- Kenneth Walker III (KC): 177 yds, 2 TD
...

**Receiving**

- Tetairoa McMillan (CAR): 14 rec, 192 yds
...

## Coming up

- TB @ DAL · Thu, October 8th at 8:15 PM EDT · AT&T Stadium, Arlington
- PHI @ JAX · Sun, October 11th at 9:30 AM EDT · Tottenham Hotspur Stadium, London
...
```

The HTML version has the same sections with the winners in bold.

## Notes

- Daily mode only sees what is on the league's current scoreboard window, which moves on to the
  next day's games. Run it late in the evening, after the last game, to capture the day's finals.
- Box scores are not available for every league or event; the API returns
  `BOXSCORE_NOT_AVAILABLE` and the recap simply leaves that game out of the leaders.
- Football box score stats come back as strings grouped by category
  (`categories.passing.passingYards`); other sports use flat keys (`points`, `rebounds`, `RBIs`).
- Start times come from `status.detail`, which the API already formats for display (Eastern time).
