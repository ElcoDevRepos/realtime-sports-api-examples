// Normalised odds feed with line-move detection for a league's upcoming games.
// Node 18+, no dependencies.
//
//   node feed.js [sport] [league] [--limit 8] [--out feed.json]
//   node feed.js football nfl
//   node feed.js football college-football --limit 5 --out cfb.json
//
// Costs 1 scoreboard call + 2 calls per game (odds + odds history).
import { writeFileSync } from 'node:fs';
import { apiGet, describe, feedEntry, loadDotEnv } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
loadDotEnv(new URL('../.env', import.meta.url));

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const [sport = 'football', league = 'nfl'] = positional;
const limit = Math.max(1, Number(opt('--limit', 8)));
const out = opt('--out', null);
const KEY = process.env.REALTIME_SPORTS_API_KEY;

if (!KEY || KEY === 'your_api_key_here') {
  console.error('Set REALTIME_SPORTS_API_KEY (see .env.example). Get a free key at https://www.realtimesportsapi.com/signup');
  process.exit(1);
}

const base = `/sports/${sport}/leagues/${league}`;

try {
  const { data: events } = await apiGet(`${base}/events`, KEY);
  const upcoming = events.filter((e) => e.status?.state === 'pre').sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, limit);
  if (!upcoming.length) console.error(`No upcoming ${league} games on the current scoreboard.`);

  const games = [];
  for (const e of upcoming) {
    // `data` is null (with a `message`) when the book has no line for this game yet.
    const odds = await apiGet(`${base}/events/${e.id}/odds`, KEY);
    const history = odds.data ? await apiGet(`${base}/events/${e.id}/odds/history`, KEY, { limit: 100 }) : { data: [] };
    const entry = feedEntry(e, odds.data, history.data, { twoWay: sport !== 'soccer' });
    games.push(entry);
    console.error(describe(entry));
  }

  const feed = {
    generatedAt: new Date().toISOString(),
    sport,
    league,
    note: 'Odds come from a single source book (see odds.provider). Data is typically 20-30 seconds behind live.',
    games
  };
  const json = JSON.stringify(feed, null, 2);
  if (out) {
    writeFileSync(out, json + '\n');
    console.error(`\nWrote ${games.length} games to ${out}`);
  } else {
    console.log(json);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
