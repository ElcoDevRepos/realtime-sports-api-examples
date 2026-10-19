// NBA live box score and player stat tracker for the Realtime Sports API. Node 18+, no dependencies.
//
//   node tracker.js                 live box scores (refreshing) + milestone alerts while games are on
//   node tracker.js --once          print the box score of every live game once
//   node tracker.js --event <id>    print one game's box score (live or finished) and exit
import { apiGet, involvesTeam, loadDotEnv, newMilestones, postWebhook, renderBox } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
loadDotEnv(new URL('../.env', import.meta.url));

const argv = process.argv.slice(2);
const env = process.env;
const LEAGUE = env.LEAGUE || 'nba'; // mens-college-basketball works too (box scores from its season start)
const TEAM = env.TEAM || '';
const WATCH = (env.WATCH || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const THRESHOLDS = (env.POINT_THRESHOLDS || '20,30,40,50').split(',').map(Number).filter(Boolean);
const LIVE_MS = Math.max(30, Number(env.POLL_SECONDS || 60)) * 1000;
const MAX_IDLE_MS = 6 * 3_600_000;
const KEY = env.REALTIME_SPORTS_API_KEY;
const base = `/sports/basketball/leagues/${LEAGUE}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(new Date().toISOString(), ...a);

function die(msg) {
  console.error(msg);
  process.exit(1);
}
if (!KEY || KEY === 'your_api_key_here') die('Set REALTIME_SPORTS_API_KEY (see .env.example). Free key: https://www.realtimesportsapi.com/signup');

async function boxFor(id) {
  try {
    return (await apiGet(`${base}/events/${id}/boxscore`, KEY)).data;
  } catch (err) {
    if (err.code === 'BOXSCORE_NOT_AVAILABLE' || err.status === 404) return null; // tip-off not reached yet
    throw err;
  }
}

const liveGames = async () => (await apiGet(`${base}/events/live`, KEY)).data.filter((g) => involvesTeam(g, TEAM));

async function printEvent(id) {
  const [{ data: game }, box] = await Promise.all([apiGet(`${base}/events/${id}`, KEY), boxFor(id)]);
  console.log(box ? renderBox(box, game, 8) : `No box score yet for ${game.shortName} (${game.status?.detail}).`);
}

async function loop() {
  log(`Tracking ${LEAGUE.toUpperCase()}${TEAM ? ` (${TEAM})` : ''} box scores every ${LIVE_MS / 1000}s while live${WATCH.length ? `; watching ${WATCH.join(', ')}` : ''}`);
  const seen = new Set();
  let first = true;
  for (;;) {
    try {
      const games = await liveGames();
      if (!games.length) {
        const events = (await apiGet(`${base}/events`, KEY)).data.filter((g) => involvesTeam(g, TEAM));
        const starts = events.filter((e) => e.status?.state === 'pre').map((e) => Date.parse(e.date)).filter((t) => t > Date.now());
        const wait = starts.length ? Math.min(Math.max(Math.min(...starts) - Date.now() - 120_000, 5 * 60_000), MAX_IDLE_MS) : TEAM && !events.length ? MAX_IDLE_MS : 15 * 60_000;
        log(`Nothing live; next check in ${Math.round(wait / 60000)} min`);
        await sleep(wait);
        continue;
      }
      const screens = [];
      for (const g of games) {
        const box = await boxFor(g.id);
        if (!box) continue;
        screens.push(renderBox(box, g));
        // On the first pass, record milestones already reached so a restart doesn't re-alert them.
        const alerts = newMilestones(g.id, box, seen, { watch: WATCH, thresholds: THRESHOLDS });
        if (first) continue;
        for (const a of alerts) {
          console.log(a.text);
          if (env.WEBHOOK_URL) await postWebhook(env.WEBHOOK_URL, a.text);
        }
      }
      first = false;
      if (process.stderr.isTTY) process.stderr.write('\x1b[2J\x1b[H'); // refresh the screen in a terminal
      process.stderr.write(screens.join('\n\n') + '\n');
      await sleep(LIVE_MS);
    } catch (err) {
      if (err.status === 401) die(err.message);
      const wait = err.status === 429 ? Math.min((err.retryAfter ?? 3600) * 1000, MAX_IDLE_MS) : LIVE_MS;
      log(`${err.message}; retrying in ${Math.round(wait / 1000)} s`);
      await sleep(wait);
    }
  }
}

const ev = argv.indexOf('--event');
if (ev >= 0) {
  if (!argv[ev + 1]) die('usage: node tracker.js --event <eventId>');
  printEvent(argv[ev + 1]).catch((e) => die(e.message));
} else if (argv.includes('--once')) {
  liveGames()
    .then(async (games) => {
      if (!games.length) return log(`No ${LEAGUE.toUpperCase()}${TEAM ? ` ${TEAM}` : ''} games live right now. Try --event <id> with a finished game.`);
      for (const g of games) {
        const box = await boxFor(g.id);
        console.log(box ? renderBox(box, g) : `${g.shortName}: no box score yet`);
      }
    })
    .catch((e) => die(e.message));
} else {
  process.once('SIGINT', () => process.exit(0));
  await loop();
}
