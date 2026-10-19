// NHL goal alerts: a terminal line, an optional phone push (ntfy) and an optional goal horn
// command for every goal, powered by the Realtime Sports API. Node 18+, no dependencies.
//
//   node alerts.js            watch live NHL games (or TEAM) and alert on every goal
//   node alerts.js --once     print the live games and their latest scoring play, then exit
//   node alerts.js --test-horn  run GOAL_COMMAND once, to check your horn works
import { spawn } from 'node:child_process';
import { apiGet, detectGoals, goalMessage, hornFor, involvesTeam, label, latestScoringPlay, loadDotEnv, nextStartMs, notifyNtfy } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
loadDotEnv(new URL('../.env', import.meta.url));

const args = new Set(process.argv.slice(2));
const env = process.env;
const LEAGUE = env.LEAGUE || 'nhl';
const TEAM = env.TEAM || '';
const LIVE_MS = Math.max(30, Number(env.POLL_SECONDS || 30)) * 1000;
const MAX_IDLE_MS = 6 * 3_600_000;
const KEY = env.REALTIME_SPORTS_API_KEY;
const base = `/sports/hockey/leagues/${LEAGUE}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(new Date().toISOString(), ...a);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function horn() {
  if (!env.GOAL_COMMAND) return;
  // Your own command, e.g. "afplay horn.mp3" (macOS), "aplay horn.wav" (Linux) or a curl to a smart plug.
  spawn(env.GOAL_COMMAND, { shell: true, stdio: 'ignore', detached: true }).unref();
}

if (args.has('--test-horn')) {
  if (!env.GOAL_COMMAND) die('Set GOAL_COMMAND first (see .env.example).');
  horn();
  process.exit(0);
}
if (!KEY || KEY === 'your_api_key_here') die('Set REALTIME_SPORTS_API_KEY (see .env.example). Free key: https://www.realtimesportsapi.com/signup');

/** One plays call (a full NHL game fits in one page of 1,000) to name the scorer. */
async function scoringPlay(game, teamId) {
  try {
    const { data } = await apiGet(`${base}/events/${game.id}/plays`, KEY, { limit: 1000 });
    return latestScoringPlay(data, teamId);
  } catch {
    return null; // the score alert still goes out without the scorer
  }
}

async function alert(goal) {
  const play = goal.kind === 'goal' ? await scoringPlay(goal.game, goal.team?.id) : null;
  const msg = goalMessage(goal, play);
  console.log(msg);
  if (hornFor(goal, TEAM)) horn();
  if (env.NTFY_URL) await notifyNtfy(env.NTFY_URL, `${label(goal.team)} ${goal.kind === 'goal' ? 'goal' : 'goal overturned'}`, msg);
}

async function once() {
  const live = (await apiGet(`${base}/events/live`, KEY)).data.filter((g) => involvesTeam(g, TEAM));
  if (!live.length) return log(`No ${LEAGUE.toUpperCase()}${TEAM ? ` ${TEAM}` : ''} games live right now.`);
  for (const g of live) {
    const play = await scoringPlay(g, null);
    console.log(`${label(g.awayTeam)} ${g.awayTeam.score} - ${g.homeTeam.score} ${label(g.homeTeam)} (${g.status?.detail}) · last goal: ${play?.text ?? 'none yet'}`);
  }
}

async function loop() {
  log(`Watching ${LEAGUE.toUpperCase()}${TEAM ? ` (${TEAM})` : ''} for goals every ${LIVE_MS / 1000}s while live`);
  let prev = new Map();
  for (;;) {
    try {
      const live = (await apiGet(`${base}/events/live`, KEY)).data.filter((g) => involvesTeam(g, TEAM));
      const { goals, next } = detectGoals(prev, live);
      for (const goal of goals) await alert(goal);
      prev = next;
      if (live.length) {
        await sleep(LIVE_MS);
        continue;
      }
      const events = (await apiGet(`${base}/events`, KEY)).data.filter((g) => involvesTeam(g, TEAM));
      const start = nextStartMs(events);
      const wait = start ? Math.min(Math.max(start - Date.now() - 120_000, 5 * 60_000), MAX_IDLE_MS) : TEAM && !events.length ? MAX_IDLE_MS : 15 * 60_000;
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

if (args.has('--once')) once().catch((e) => die(e.message));
else {
  process.once('SIGINT', () => process.exit(0));
  await loop();
}
