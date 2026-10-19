// Pure helpers for the OBS score overlay server (plus apiGet). Unit tested with `node --test`.
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
    throw err;
  }
  return body;
}

/** Only these characters reach the upstream path: lowercase slugs such as "basketball", "eng.1". */
export const SLUG = /^(?!.*\.\.)[a-z0-9][a-z0-9.-]{1,39}$/;

const isTeam = (t, team) => {
  const q = String(team).toLowerCase();
  return t && (String(t.id) === q || String(t.abbreviation ?? '').toLowerCase() === q);
};

/**
 * The game to show for `team` from a scoreboard (/events) response: a live game first, then the
 * next upcoming one, then the most recent final. Without a team, the first live game, else the first game.
 */
export function pickGame(events, team, now = Date.now()) {
  const games = (events ?? []).filter((g) => !team || isTeam(g.homeTeam, team) || isTeam(g.awayTeam, team));
  const by = (state) => games.filter((g) => g.status?.state === state);
  const live = by('in');
  if (live.length) return live[0];
  const pre = by('pre').filter((g) => Date.parse(g.date) >= now - 3_600_000).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (pre.length && team) return pre[0];
  const post = by('post').sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (post.length && team) return post[0];
  return games[0] ?? null;
}

/** The small object the overlay page renders. No logos: abbreviations and team colours only. */
export function toOverlay(game) {
  if (!game) return { state: 'none' };
  const side = (t) => ({ abbr: t?.abbreviation || t?.name || '?', score: t?.score ?? 0, color: t?.color ? `#${t.color}` : null });
  return {
    id: game.id,
    state: game.status?.state ?? 'pre',
    detail: game.status?.detail ?? '',
    away: side(game.awayTeam),
    home: side(game.homeTeam)
  };
}

/** How long to cache a result: 30 s while live, until ~5 min before tip-off when upcoming (max 10 min), 10 min after a final. */
export function ttlFor(game, now = Date.now()) {
  const state = game?.status?.state;
  if (state === 'in') return 30_000;
  if (state === 'pre') {
    const until = Date.parse(game.date) - now - 5 * 60_000;
    return Math.max(30_000, Math.min(Number.isFinite(until) ? until : 600_000, 600_000));
  }
  return 600_000;
}

/** Tiny TTL cache that also coalesces concurrent misses into one upstream request. */
export function createCache(now = () => Date.now()) {
  const store = new Map();
  return async function cached(key, load) {
    const hit = store.get(key);
    if (hit && (hit.pending || hit.expires > now())) return hit.pending ?? hit.value;
    const pending = load().then(
      ({ value, ttl }) => {
        store.set(key, { value, expires: now() + ttl });
        return value;
      },
      (err) => {
        store.delete(key);
        throw err;
      }
    );
    store.set(key, { pending, expires: 0 });
    return pending;
  };
}
