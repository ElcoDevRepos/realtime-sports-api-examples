// Pure helpers for the NBA live box score tracker (plus apiGet/postWebhook). Unit tested with node --test.
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
    err.code = body?.error?.code;
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

const num = (v) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Find a "made-attempted" stat by key pattern, e.g. threePointFieldGoalsMade-threePointFieldGoalsAttempted -> "3-7". */
function madeAttempted(p, re) {
  const k = Object.keys(p).find((key) => re.test(key));
  return k ? String(p[k]) : null;
}

/**
 * Normalise one basketball box score player. points/rebounds/assists are numbers and minutes a
 * string; the other stats keep the API's own keys (strings), so we read them defensively.
 */
export function playerStats(p) {
  return {
    name: p.name,
    pts: num(p.points),
    reb: num(p.rebounds),
    ast: num(p.assists),
    stl: num(p.steals),
    blk: num(p.blocks),
    min: p.minutes ?? '',
    fg: madeAttempted(p, /^fieldGoalsMade-fieldGoalsAttempted$/i),
    three: madeAttempted(p, /^threePoint.*Made.*Attempted$/i),
    dnp: Boolean(p.didNotPlay)
  };
}

/** "LeBron James  28 PTS  7 REB  9 AST  (10-18 FG, 3-7 3PT, 34 MIN)" */
export function playerLine(p) {
  const s = playerStats(p);
  const extra = [s.fg && `${s.fg} FG`, s.three && `${s.three} 3PT`, s.min && `${s.min} MIN`].filter(Boolean).join(', ');
  return `${s.name}  ${s.pts} PTS  ${s.reb} REB  ${s.ast} AST${extra ? `  (${extra})` : ''}`;
}

/** Players who played, best scorers first. */
export function topPlayers(players, n = 5) {
  return (players ?? [])
    .filter((p) => !p.didNotPlay)
    .sort((a, b) => num(b.points) - num(a.points) || num(b.rebounds) + num(b.assists) - num(a.rebounds) - num(a.assists))
    .slice(0, n);
}

/** Plain-text box score: score line, period scores, top players per team. */
export function renderBox(box, game, top = 5) {
  const a = box.awayTeam ?? game?.awayTeam ?? {};
  const h = box.homeTeam ?? game?.homeTeam ?? {};
  const lines = [`${label(a)} ${a.score ?? 0} @ ${label(h)} ${h.score ?? 0}${game?.status?.detail ? `  ·  ${game.status.detail}` : ''}`];
  const ps = box.periodScores;
  if (ps?.home?.length) {
    lines.push(`  ${label(a).padEnd(4)} ${ps.away.map((x) => String(x).padStart(3)).join(' ')}`);
    lines.push(`  ${label(h).padEnd(4)} ${ps.home.map((x) => String(x).padStart(3)).join(' ')}`);
  }
  for (const [team, players] of [[a, box.awayPlayers], [h, box.homePlayers]]) {
    lines.push(`  ${label(team)}`);
    for (const p of topPlayers(players, top)) lines.push(`    ${playerLine(p)}`);
  }
  return lines.join('\n');
}

const DOUBLE_CATS = ['pts', 'reb', 'ast', 'stl', 'blk'];

/**
 * Milestones a player has reached: points thresholds, double-double, triple-double. Returns
 * stable ids like "30pts" / "triple-double", so callers can alert once per player per game.
 */
export function milestonesFor(p, thresholds = [20, 30, 40, 50]) {
  const s = playerStats(p);
  const out = [];
  for (const t of thresholds) if (s.pts >= t) out.push({ id: `${t}pts`, text: `${t}+ points` });
  const tens = DOUBLE_CATS.filter((c) => s[c] >= 10).length;
  if (tens >= 3) out.push({ id: 'triple-double', text: 'a triple-double' });
  else if (tens >= 2) out.push({ id: 'double-double', text: 'a double-double' });
  return out;
}

/**
 * New milestones since last time. `seen` is a Set of "eventId:playerId:milestoneId" and is
 * updated in place. Players in `watch` (lowercase names; empty = everyone) are the only ones checked.
 */
export function newMilestones(eventId, box, seen, { watch = [], thresholds } = {}) {
  const out = [];
  for (const [side, players] of [['awayTeam', box.awayPlayers], ['homeTeam', box.homePlayers]]) {
    for (const p of players ?? []) {
      if (watch.length && !watch.includes(String(p.name).toLowerCase())) continue;
      for (const m of milestonesFor(p, thresholds)) {
        const key = `${eventId}:${p.id ?? p.name}:${m.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ player: p, team: box[side], milestone: m, text: `🏀 ${p.name} (${label(box[side])}) has ${m.text}: ${playerLine(p)}` });
      }
    }
  }
  return out;
}

/** POST a message to a Discord or Slack webhook (Discord reads `content`, Slack reads `text`). */
export async function postWebhook(url, message) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: message, text: message }) });
  if (!res.ok) console.error(`webhook failed: HTTP ${res.status}`);
}
