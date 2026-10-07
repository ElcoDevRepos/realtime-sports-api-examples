// Helpers for the Slack scoreboard. Network-free except apiGet/postToSlack, so the diff and
// formatting logic can be unit tested with `node --test`.
import { existsSync, readFileSync } from 'node:fs';

export const API_BASE = process.env.RSA_API_BASE || 'https://www.realtimesportsapi.com/api/v1';

/** Minimal .env loader (KEY=value lines). Variables already in the environment win. */
export function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

/** GET a path under /api/v1 and return the envelope { success, data, meta }. Throws on non-2xx. */
export async function apiGet(path, key, query = {}) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${body?.error?.code ?? ''}: ${body?.error?.message ?? 'request failed'}`);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || undefined;
    throw err;
  }
  return body;
}

export function teamLabel(t) {
  return t?.abbreviation || t?.name || '?';
}

/** Snapshot of what we compare between polls. */
export function snapshot(game) {
  return {
    away: game.awayTeam?.score ?? 0,
    home: game.homeTeam?.score ?? 0,
    state: game.status?.state ?? 'pre'
  };
}

/**
 * Compare the previous snapshot map (eventId -> snapshot) with the games currently live.
 * Returns:
 *   started:  games live now that were not live last time (only when `prev` was initialised)
 *   scored:   games whose score changed
 *   finished: eventIds that were live last time and are gone now (fetch them for the final)
 *   next:     the new snapshot map
 */
export function diffGames(prev, games, { initialised = true } = {}) {
  const next = new Map();
  const started = [];
  const scored = [];
  for (const g of games) {
    const snap = snapshot(g);
    next.set(g.id, snap);
    const old = prev.get(g.id);
    if (!old) {
      if (initialised) started.push(g);
    } else if (old.away !== snap.away || old.home !== snap.home) {
      scored.push(g);
    }
  }
  const finished = [...prev.keys()].filter((id) => !next.has(id));
  return { started, scored, finished, next };
}

/** "TB 14 - 10 DAL" (away first, like a scoreboard). Scores are omitted before kickoff. */
export function scoreLine(game) {
  const a = game.awayTeam ?? {};
  const h = game.homeTeam ?? {};
  if (game.status?.state === 'pre') return `${teamLabel(a)} @ ${teamLabel(h)}`;
  return `${teamLabel(a)} ${a.score ?? 0} - ${h.score ?? 0} ${teamLabel(h)}`;
}

const KIND_PREFIX = { start: ':large_green_circle: Started', score: ':rotating_light: Score', final: ':checkered_flag: Final', info: '' };

/**
 * Build a Slack Incoming Webhook payload for one game.
 * `text` is the notification/fallback text; `blocks` is what Slack renders.
 */
export function slackPayload(game, kind = 'score', league = '') {
  const prefix = KIND_PREFIX[kind] ?? '';
  const detail = game.status?.detail || (kind === 'final' ? 'Final' : '');
  const line = scoreLine(game);
  const text = `${prefix ? prefix + ': ' : ''}${line}${detail ? ` (${detail})` : ''}`;
  const tag = league ? `${league.toUpperCase()} · ` : '';
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `${prefix ? prefix + '  ' : ''}*${line}*` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${tag}${detail || ' '}` }] }
    ]
  };
}

/** Earliest future start time (ms) among pre-game events, or null. */
export function nextStartMs(events, now = Date.now()) {
  let best = null;
  for (const e of events ?? []) {
    if (e?.status?.state !== 'pre' || !e.date) continue;
    const t = Date.parse(e.date);
    if (Number.isFinite(t) && t > now && (best === null || t < best)) best = t;
  }
  return best;
}

/** Idle sleep: the idle interval, or until ~2 min before a distant next game, capped at maxIdleMs. */
export function idleSleepMs({ nextStart, now = Date.now(), idleMs, maxIdleMs }) {
  if (nextStart == null) return idleMs;
  const until = nextStart - now - 2 * 60_000;
  if (until <= idleMs) return idleMs;
  return Math.min(until, maxIdleMs);
}

/** POST a payload to a Slack Incoming Webhook URL, retrying once on 429. */
export async function postToSlack(webhookUrl, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) return true;
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 1;
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    console.error(`Slack webhook failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    return false;
  }
  return false;
}
