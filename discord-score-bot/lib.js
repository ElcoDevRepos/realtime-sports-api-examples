// Helpers for the bot, kept free of network I/O so they can be unit tested with `node --test`.
import { existsSync, readFileSync } from 'node:fs';

/** Minimal .env loader (KEY=value lines; existing environment variables win). Works on Node 18+. */
export function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/** Short label for a team object from an event or WebSocket payload. */
export function teamLabel(team) {
  if (!team) return '?';
  return team.abbreviation || team.shortDisplayName || team.name || team.displayName || team.id || '?';
}

/** True when `teamFilter` (abbreviation or id, case-insensitive) matches either side. Empty filter matches all. */
export function involvesTeam(game, teamFilter) {
  if (!teamFilter) return true;
  const want = String(teamFilter).trim().toLowerCase();
  return [game?.homeTeam, game?.awayTeam].some(
    (t) => t && [t.abbreviation, t.id, t.name, t.displayName].some((v) => v != null && String(v).toLowerCase() === want)
  );
}

export function scoreKey(game) {
  return `${game?.awayTeam?.score ?? '-'}-${game?.homeTeam?.score ?? '-'}`;
}

/** "**KC 14 - 10 BAL**  (5:23 - 2nd Quarter)" (away first, like a scoreboard). */
export function formatScore(game, prefix = '') {
  const a = game.awayTeam ?? {};
  const h = game.homeTeam ?? {};
  const detail = game.status?.detail ? `  (${game.status.detail})` : '';
  return `${prefix}**${teamLabel(a)} ${a.score ?? 0} - ${h.score ?? 0} ${teamLabel(h)}**${detail}`;
}

/**
 * Compare the previous scores with the current live games.
 * Returns { changes: games whose score changed, finished: eventIds no longer live, next: new score map }.
 */
export function diffScores(prev, games) {
  const next = new Map();
  const changes = [];
  for (const g of games) {
    const key = scoreKey(g);
    next.set(g.id, key);
    if (prev.has(g.id) && prev.get(g.id) !== key) changes.push(g);
  }
  const finished = [...prev.keys()].filter((id) => !next.has(id));
  return { changes, finished, next };
}

/** Earliest upcoming start time (ms) among events in state "pre", or null. */
export function nextStartMs(events, now = Date.now()) {
  let best = null;
  for (const e of events ?? []) {
    if (e?.status?.state !== 'pre' || !e.date) continue;
    const t = Date.parse(e.date);
    if (Number.isFinite(t) && t > now && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * How long to sleep when nothing is live: the idle interval, or (when the next game is further away)
 * until ~2 minutes before it, capped at maxIdleMs.
 */
export function idleSleepMs({ nextStart, now = Date.now(), idleMs, maxIdleMs }) {
  if (nextStart == null) return idleMs;
  const untilStart = nextStart - now - 2 * 60_000;
  if (untilStart <= idleMs) return idleMs;
  return Math.min(untilStart, maxIdleMs);
}
