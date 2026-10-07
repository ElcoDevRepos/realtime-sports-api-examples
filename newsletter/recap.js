// Build a sports recap newsletter (final scores, top performers, upcoming games) as Markdown and
// HTML, ready to paste into any email tool. Node 18+, no dependencies.
//
//   node recap.js                                   NFL: last completed week + this week's games
//   node recap.js --league college-football
//   node recap.js --sport basketball --league nba   daily: finals and upcoming on the current scoreboard
//   node recap.js --boxscores 4 --out-dir out
//
// Weekly mode (nfl, college-football): 1 scoreboard call + 1 schedule call + 1 call per box score.
// Daily mode (other leagues):          1 scoreboard call + 1 call per box score.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiGet, loadDotEnv, renderHtml, renderMarkdown, statLeaders } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
loadDotEnv(new URL('../.env', import.meta.url));

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const sport = opt('--sport', 'football');
const league = opt('--league', 'nfl');
const maxBoxscores = Math.max(0, Number(opt('--boxscores', 16)));
const outDir = opt('--out-dir', 'out');
const KEY = process.env.REALTIME_SPORTS_API_KEY;
const WEEKLY = ['nfl', 'college-football'].includes(league);

if (!KEY || KEY === 'your_api_key_here') {
  console.error('Set REALTIME_SPORTS_API_KEY (see .env.example). Get a free key at https://www.realtimesportsapi.com/signup');
  process.exit(1);
}

const base = `/sports/${sport}/leagues/${league}`;
let calls = 0;
const get = (path, query) => {
  calls++;
  return apiGet(path, KEY, query);
};
const byDate = (a, b) => Date.parse(a.date) - Date.parse(b.date);

try {
  const { data: board } = await get(`${base}/events`);
  const upcoming = board.filter((e) => e.status?.state === 'pre').sort(byDate);
  let finals;
  let heading;

  if (WEEKLY) {
    // The scoreboard is on the current week; recap the one before it.
    const ref = board[0]?.season;
    const week = ref?.week?.number;
    if (!week) throw new Error('Could not tell the current week from the scoreboard.');
    const lastWeek = week - 1;
    if (lastWeek < 1) throw new Error('No completed regular-season week yet.');
    const { data: games } = await get(`${base}/seasons/${ref.year}/schedule`, { week: lastWeek, seasonType: ref.type?.id });
    finals = games.filter((e) => e.status?.state === 'post').sort(byDate);
    heading = `${league.toUpperCase()} Week ${lastWeek} recap`;
  } else {
    finals = board.filter((e) => e.status?.state === 'post').sort(byDate);
    heading = `${league.toUpperCase()} daily recap`;
  }

  // Box scores for the top performers. Some leagues/events have none (BOXSCORE_NOT_AVAILABLE).
  const boxes = [];
  for (const game of finals.slice(0, maxBoxscores)) {
    try {
      const { data: box } = await get(`${base}/events/${game.id}/boxscore`);
      if (box) boxes.push({ game, box });
    } catch (err) {
      console.error(`  no box score for ${game.shortName}: ${err.code ?? err.message}`);
    }
  }
  const leaders = statLeaders(sport, boxes);
  const leadersNote = boxes.length && boxes.length < finals.length ? `From box scores of ${boxes.length} of ${finals.length} games.` : '';

  const today = new Date().toISOString().slice(0, 10);
  const doc = {
    title: heading,
    subtitle: `${finals.length} final${finals.length === 1 ? '' : 's'}, ${upcoming.length} upcoming · generated ${today}`,
    finals,
    leaders,
    leadersNote,
    upcoming: upcoming.slice(0, 20),
    footer:
      'Scores and stats from the <a href="https://www.realtimesportsapi.com/?utm_source=newsletter">Realtime Sports API</a>.'
  };
  const md = renderMarkdown({ ...doc, footer: 'Scores and stats from the [Realtime Sports API](https://www.realtimesportsapi.com/?utm_source=newsletter).' });
  const html = renderHtml(doc);

  mkdirSync(outDir, { recursive: true });
  const stem = join(outDir, `recap-${league}-${today}`);
  writeFileSync(`${stem}.md`, md);
  writeFileSync(`${stem}.html`, html);
  console.log(md);
  console.error(`Wrote ${stem}.md and ${stem}.html (${calls} API calls)`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
