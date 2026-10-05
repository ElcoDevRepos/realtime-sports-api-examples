// Discord score bot for the Realtime Sports API.
// Streams score changes over the WebSocket (paid plans; Free has a 500-message monthly preview) or falls back to sane REST polling.
// Usage: npm start            (posts to DISCORD_WEBHOOK_URL)
//        npm run dry-run      (prints messages instead of posting)
import WebSocket from 'ws';
import { RealtimeSportsClient, RealtimeSportsError } from 'realtime-sports-api';
import { diffScores, formatScore, idleSleepMs, involvesTeam, loadDotEnv, nextStartMs, scoreKey } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
const env = process.env;
const DRY_RUN = process.argv.includes('--dry-run') || env.DRY_RUN === '1';
const SPORT = env.SPORT || 'football';
const LEAGUE = env.LEAGUE || 'nfl';
const TEAM = (env.TEAM || '').trim();
const MODE = (env.MODE || 'auto').toLowerCase();
const LIVE_MS = Math.max(30, Number(env.POLL_LIVE_SECONDS || 60)) * 1000;
const IDLE_MS = Math.max(5, Number(env.POLL_IDLE_MINUTES || 15)) * 60_000;
const MAX_IDLE_MS = Math.max(1, Number(env.POLL_MAX_IDLE_HOURS || 6)) * 3_600_000;

if (!env.REALTIME_SPORTS_API_KEY || env.REALTIME_SPORTS_API_KEY === 'your_api_key_here') {
  die('Set REALTIME_SPORTS_API_KEY (see .env.example). Get a free key at https://www.realtimesportsapi.com/signup');
}
if (!env.DISCORD_WEBHOOK_URL && !DRY_RUN) die('Set DISCORD_WEBHOOK_URL, or run with --dry-run.');

const client = new RealtimeSportsClient({
  apiKey: env.REALTIME_SPORTS_API_KEY,
  ...(env.RSA_BASE_URL ? { baseUrl: env.RSA_BASE_URL } : {}) // only for local testing
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// ---------------------------------------------------------------- Discord

async function post(content) {
  if (DRY_RUN) {
    log('[dry-run]', content);
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });
    if (res.ok) return;
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(Math.ceil((body.retry_after ?? 1) * 1000));
      continue;
    }
    log('Discord webhook failed:', res.status, await res.text().catch(() => ''));
    return;
  }
}

// ---------------------------------------------------------------- WebSocket mode

function runStream() {
  return new Promise((resolve) => {
    const lastScore = new Map(); // eventId -> "away-home", dedupes repeats after reconnects
    const filters = { sport: SPORT, league: LEAGUE };
    let settled = false;
    const stream = client.stream({
      WebSocket: globalThis.WebSocket ?? WebSocket,
      subscriptions: [
        { event: 'event_score_change', filters },
        { event: 'event_final', filters }
      ],
      onOpen: () => log(`Streaming ${SPORT}/${LEAGUE}${TEAM ? ` (team ${TEAM})` : ''}`),
      onSubscribed: (ack) => ack.warnings?.forEach((w) => log('Subscription warning:', w)),
      onMessage: async (msg) => {
        const g = { ...msg.data, id: msg.data.eventId };
        if (!involvesTeam(g, TEAM)) return;
        if (msg.type === 'event_final') {
          lastScore.delete(g.id);
          await post(formatScore({ ...g, status: { detail: 'Final' } }, 'FINAL: '));
          return;
        }
        const key = scoreKey(g);
        if (lastScore.get(g.id) === key) return;
        lastScore.set(g.id, key);
        await post(formatScore(g));
      },
      onError: (err) => {
        log('Stream error:', err.code, err.message);
        // No WebSocket on this plan (or bad key / quota): hand over to polling in auto mode.
        const fatal = err.code === 'WEBSOCKET_FORBIDDEN' || err.status === 401 || err.status === 403 || err.status === 429;
        if (fatal && !settled) {
          settled = true;
          stream.close();
          resolve(err);
        }
      }
    });
    const stop = () => {
      stream.close();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

// ---------------------------------------------------------------- REST polling mode

async function runPolling() {
  log(`Polling ${SPORT}/${LEAGUE}${TEAM ? ` (team ${TEAM})` : ''}: every ${LIVE_MS / 1000}s while live, idle ${IDLE_MS / 60000} min`);
  let prev = new Map();
  let live = false;
  for (;;) {
    try {
      if (live || prev.size > 0) {
        // 1 call per cycle while games are live.
        const games = (await client.listLiveEvents(SPORT, LEAGUE)).filter((g) => involvesTeam(g, TEAM));
        const { changes, finished, next } = diffScores(prev, games);
        for (const g of changes) await post(formatScore(g));
        for (const id of finished) {
          // 1 extra call per finished game for the final score.
          const g = await client.getEvent(SPORT, LEAGUE, id).catch(() => null);
          if (g) await post(formatScore({ ...g, status: { ...g.status, detail: g.status?.detail || 'Final' } }, 'FINAL: '));
        }
        if (prev.size === 0 && games.length) log(`Tracking ${games.length} live game(s)`);
        prev = next;
        live = games.length > 0;
        if (live) {
          await sleep(LIVE_MS);
          continue;
        }
      }
      // Idle: 1 call to the scoreboard window, which includes live and upcoming games.
      const events = (await client.listEvents(SPORT, LEAGUE)).filter((g) => involvesTeam(g, TEAM));
      const liveNow = events.filter((e) => e.status?.state === 'in');
      if (liveNow.length) {
        prev = new Map(liveNow.map((g) => [g.id, scoreKey(g)]));
        live = true;
        for (const g of liveNow) await post(formatScore(g, 'LIVE: '));
        await sleep(LIVE_MS);
        continue;
      }
      const wait = idleSleepMs({ nextStart: nextStartMs(events), idleMs: IDLE_MS, maxIdleMs: MAX_IDLE_MS });
      log(`Nothing live; next check in ${Math.round(wait / 60000)} min`);
      await sleep(wait);
    } catch (err) {
      if (err instanceof RealtimeSportsError && err.isRateLimited) {
        const wait = Math.min((err.retryAfter ?? 3600) * 1000, 6 * 3_600_000);
        log(`Monthly quota exhausted; sleeping ${Math.round(wait / 60000)} min. Upgrade or wait for the reset.`);
        await sleep(wait);
      } else if (err instanceof RealtimeSportsError && err.isAuthError) {
        die(`Auth failed (${err.code}): ${err.message}`);
      } else {
        log('Polling error:', err?.message ?? err);
        await sleep(LIVE_MS);
      }
    }
  }
}

// ---------------------------------------------------------------- main

if (MODE === 'poll') {
  await runPolling();
} else {
  const err = await runStream();
  if (MODE === 'stream') die(`Stream stopped: ${err?.message}`);
  log('Falling back to REST polling.');
  await runPolling();
}
