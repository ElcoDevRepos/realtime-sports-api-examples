// Pure helpers for NHL goal alerts (plus apiGet/notify). Unit tested with `node --test`.
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

export const label = (t) => t?.abbreviation || t?.name || '?';

/** True when `team` (abbreviation or id, case-insensitive) plays in `game`. Empty team = every game. */
export function involvesTeam(game, team) {
  if (!team) return true;
  const t = String(team).toLowerCase();
  return [game.homeTeam, game.awayTeam].some((x) => x && (String(x.id) === t || String(x.abbreviation ?? '').toLowerCase() === t));
}

/**
 * Compare the last scores (eventId -> { away, home }) with the live games now and return
 *   goals:  [{ game, side: 'home'|'away', team, count, kind: 'goal'|'overturned' }]
 *   next:   the new score map
 * A score that goes down is a goal taken off the board after review ("overturned").
 * Games seen for the first time only set a baseline, so a restart never fires old goals.
 */
export function detectGoals(prev, games) {
  const next = new Map();
  const goals = [];
  for (const g of games) {
    const now = { away: g.awayTeam?.score ?? 0, home: g.homeTeam?.score ?? 0 };
    next.set(g.id, now);
    const old = prev.get(g.id);
    if (!old) continue;
    for (const side of ['away', 'home']) {
      const diff = now[side] - old[side];
      if (diff === 0) continue;
      goals.push({ game: g, side, team: g[`${side}Team`], count: Math.abs(diff), kind: diff > 0 ? 'goal' : 'overturned' });
    }
  }
  return { goals, next };
}

/** The most recent scoring play, preferring one credited to `teamId`. Plays arrive in chronological order. */
export function latestScoringPlay(plays, teamId) {
  const scoring = (plays ?? []).filter((p) => p?.scoringPlay);
  if (!scoring.length) return null;
  const forTeam = teamId != null ? scoring.filter((p) => String(p.teamId ?? p.team?.id ?? '') === String(teamId)) : [];
  return (forTeam.length ? forTeam : scoring).at(-1);
}

/** "🚨 CAR GOAL! CAR 2 - 1 CGY (13:12 - 2nd Period) · S. Aho (5) Wrist Shot" */
export function goalMessage({ game, team, kind }, play = null) {
  const score = `${label(game.awayTeam)} ${game.awayTeam?.score ?? 0} - ${game.homeTeam?.score ?? 0} ${label(game.homeTeam)}`;
  const when = game.status?.detail ? ` (${game.status.detail})` : '';
  if (kind === 'overturned') return `❌ ${label(team)} goal taken off the board. ${score}${when}`;
  const who = play?.text ? ` · ${play.text}` : '';
  return `🚨 ${label(team)} GOAL! ${score}${when}${who}`;
}

/** Should this goal trigger the horn? Only the followed team's goals when TEAM is set. */
export function hornFor(goal, team) {
  if (goal.kind !== 'goal') return false;
  if (!team) return true;
  const t = String(team).toLowerCase();
  return String(goal.team?.id) === t || String(goal.team?.abbreviation ?? '').toLowerCase() === t;
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

/** Post a plain-text push to an ntfy topic URL (https://ntfy.sh/<topic> or your own server). */
export async function notifyNtfy(url, title, message) {
  const res = await fetch(url, { method: 'POST', headers: { Title: title, Tags: 'ice_hockey,rotating_light' }, body: message });
  if (!res.ok) console.error(`ntfy failed: HTTP ${res.status}`);
}
