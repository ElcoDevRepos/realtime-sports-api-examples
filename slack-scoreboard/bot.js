// Slack live-score bot for the Realtime Sports API. Node 18+, no dependencies.
//
//   node bot.js                    poll and post score changes to SLACK_WEBHOOK_URL
//   node bot.js --dry-run          same loop, but print the Slack payloads instead of posting
//   node bot.js --once             one pass: print a payload for every game live right now
//   node bot.js --once --scoreboard   one pass over the league scoreboard (upcoming, live, final)
//   node bot.js --once --post      one pass, actually posting to Slack
import { apiGet, diffGames, idleSleepMs, loadDotEnv, nextStartMs, postToSlack, slackPayload } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
loadDotEnv(new URL('../.env', import.meta.url)); // repo-root .env as a fallback

const args = new Set(process.argv.slice(2));
const env = process.env;
const ONCE = args.has('--once');
const DRY_RUN = args.has('--dry-run') || (ONCE && !args.has('--post'));
const SPORT = env.SPORT || 'football';
const LEAGUE = env.LEAGUE || 'nfl';
const LIVE_MS = Math.max(30, Number(env.POLL_SECONDS || 60)) * 1000;
const IDLE_MS = Math.max(5, Number(env.IDLE_MINUTES || 15)) * 60_000;
const MAX_IDLE_MS = 6 * 3_600_000;
const KEY = env.REALTIME_SPORTS_API_KEY;

if (!KEY || KEY === 'your_api_key_here') {
  die('Set REALTIME_SPORTS_API_KEY (see .env.example). Get a free key at https://www.realtimesportsapi.com/signup');
}
if (!DRY_RUN && !env.SLACK_WEBHOOK_URL) die('Set SLACK_WEBHOOK_URL, or run with --dry-run / --once.');

const base = `/sports/${SPORT}/leagues/${LEAGUE}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(new Date().toISOString(), ...a); // logs on stderr, payloads on stdout

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function send(payload) {
  if (DRY_RUN) {
    console.log(JSON.stringify(payload));
    return;
  }
  await postToSlack(env.SLACK_WEBHOOK_URL, payload);
}

async function once() {
  const path = args.has('--scoreboard') ? `${base}/events` : `${base}/events/live`;
  const { data: games } = await apiGet(path, KEY);
  if (!games.length) {
    log(`No ${LEAGUE} games ${args.has('--scoreboard') ? 'on the scoreboard' : 'live right now'}.`);
    return;
  }
  for (const g of games) {
    const kind = g.status?.state === 'post' ? 'final' : g.status?.state === 'in' ? 'score' : 'info';
    await send(slackPayload(g, kind, LEAGUE));
  }
}

async function loop() {
  log(`Watching ${SPORT}/${LEAGUE}: every ${LIVE_MS / 1000}s while live${DRY_RUN ? ' (dry run)' : ''}`);
  let prev = new Map();
  let initialised = false;
  for (;;) {
    try {
      const { data: live } = await apiGet(`${base}/events/live`, KEY);
      const { started, scored, finished, next } = diffGames(prev, live, { initialised });
      for (const g of started) await send(slackPayload(g, 'start', LEAGUE));
      for (const g of scored) await send(slackPayload(g, 'score', LEAGUE));
      for (const id of finished) {
        // One extra call per finished game, to post the final score.
        const { data: g } = await apiGet(`${base}/events/${id}`, KEY).catch(() => ({ data: null }));
        if (g) await send(slackPayload(g, 'final', LEAGUE));
      }
      prev = next;
      initialised = true;
      if (live.length) {
        await sleep(LIVE_MS);
        continue;
      }
      // Nothing live: one scoreboard call to find the next start time, then sleep.
      const { data: events } = await apiGet(`${base}/events`, KEY);
      const wait = idleSleepMs({ nextStart: nextStartMs(events), idleMs: IDLE_MS, maxIdleMs: MAX_IDLE_MS });
      log(`Nothing live; next check in ${Math.round(wait / 60000)} min`);
      await sleep(wait);
    } catch (err) {
      if (err.status === 401) die(err.message);
      const wait = err.status === 429 ? Math.min((err.retryAfter ?? 3600) * 1000, MAX_IDLE_MS) : LIVE_MS;
      log(`${err.message}; retrying in ${Math.round(wait / 1000)} s`);
      await sleep(wait);
    }
  }
}

if (ONCE) {
  once().catch((err) => die(err.message));
} else {
  process.once('SIGINT', () => process.exit(0));
  await loop();
}
