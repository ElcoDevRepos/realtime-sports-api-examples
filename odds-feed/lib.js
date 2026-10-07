// Odds normalisation and line-move detection. Pure functions, unit tested in test/.
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

/** GET a path under /api/v1 and return the envelope { success, data, meta, message? }. */
export async function apiGet(path, key, query = {}) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${body?.error?.code ?? ''}: ${body?.error?.message ?? 'request failed'} (${path})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** American odds -> implied probability (0..1), including the book's margin. */
export function impliedProbability(american) {
  const a = num(american);
  if (a === null || a === 0) return null;
  return a < 0 ? -a / (-a + 100) : 100 / (a + 100);
}

/**
 * Normalise one odds object from /odds (or an /odds/history snapshot) into a flat, stable shape.
 * Returns null when there are no odds (the API returns `data: null` in that case).
 * `spread.line` is from the home team's perspective (-8.5 = home favoured by 8.5).
 * Pass `twoWay: false` for soccer: the moneyline has no draw price, so a two-way implied win
 * probability would be misleading and is left null.
 */
export function normalizeOdds(o, { twoWay = true } = {}) {
  if (!o || typeof o !== 'object') return null;
  const spread = o.spread ? { line: num(o.spread.line), home: num(o.spread.home), away: num(o.spread.away) } : null;
  const moneyline = o.moneyline ? { home: num(o.moneyline.home), away: num(o.moneyline.away) } : null;
  const total = o.overUnder ? { line: num(o.overUnder.total), over: num(o.overUnder.over), under: num(o.overUnder.under) } : null;
  if (!spread && !moneyline && !total) return null;
  let impliedWin = null;
  const ph = impliedProbability(moneyline?.home);
  const pa = impliedProbability(moneyline?.away);
  if (twoWay && ph !== null && pa !== null) {
    // Remove the margin so the two sides sum to 1.
    impliedWin = { home: round(ph / (ph + pa), 3), away: round(pa / (ph + pa), 3) };
  }
  return { provider: o.provider ?? null, spread, moneyline, total, impliedWin, updatedAt: o.updatedAt ?? null };
}

function round(x, places) {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}

/** The values whose change we call a "line move". */
const TRACKED = [
  ['spread', (o) => o?.spread?.line],
  ['total', (o) => o?.total?.line],
  ['moneyline.home', (o) => o?.moneyline?.home],
  ['moneyline.away', (o) => o?.moneyline?.away]
];

/**
 * Sort history snapshots oldest -> newest, drop consecutive duplicates, and list every change in
 * the tracked values: [{ market, from, to, at }]. Also returns opening and latest snapshots.
 */
export function detectMoves(history) {
  const snaps = (history ?? [])
    .map((h) => ({ at: h.timestamp ?? h.odds?.updatedAt, odds: normalizeOdds(h.odds) }))
    .filter((s) => s.at && s.odds)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const moves = [];
  let prev = null;
  for (const s of snaps) {
    if (prev) {
      for (const [market, get] of TRACKED) {
        const from = get(prev.odds);
        const to = get(s.odds);
        if (from != null && to != null && from !== to) moves.push({ market, from, to, at: s.at });
      }
    }
    prev = s;
  }
  return { opening: snaps[0] ?? null, latest: snaps.at(-1) ?? null, snapshots: snaps.length, moves };
}

/** Net change in spread and total from opening to now (null when unknown). */
export function netMovement(opening, current) {
  const diff = (a, b) => (a != null && b != null ? round(b - a, 2) : null);
  return {
    spread: diff(opening?.spread?.line, current?.spread?.line),
    total: diff(opening?.total?.line, current?.total?.line)
  };
}

/** Build one feed entry for a game. */
export function feedEntry(event, oddsData, historyData, { twoWay = true } = {}) {
  const current = normalizeOdds(oddsData, { twoWay });
  const { opening, latest, snapshots, moves } = detectMoves(historyData);
  // The current line can be newer than the last history snapshot; count that change too.
  if (current && latest) {
    for (const [market, get] of TRACKED) {
      const from = get(latest.odds);
      const to = get(current);
      if (from != null && to != null && from !== to) moves.push({ market, from, to, at: current.updatedAt });
    }
  }
  const net = netMovement(opening?.odds, current);
  return {
    eventId: event.id,
    name: event.name,
    shortName: event.shortName,
    start: event.date,
    home: { id: event.homeTeam?.id, abbreviation: event.homeTeam?.abbreviation, name: event.homeTeam?.name },
    away: { id: event.awayTeam?.id, abbreviation: event.awayTeam?.abbreviation, name: event.awayTeam?.name },
    odds: current,
    opening: opening ? { ...opening.odds, recordedAt: opening.at } : null,
    movement: { ...net, snapshots, moves, lineMoved: moves.some((m) => m.market === 'spread' || m.market === 'total') }
  };
}

/** "TB @ DAL  DAL -8.5  O/U 47.5  ML DAL -455 / TB +350  (spread moved -5 since open)" */
export function describe(entry) {
  const o = entry.odds;
  if (!o) return `${entry.shortName}  no odds available`;
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  const parts = [entry.shortName];
  if (o.spread?.line != null) parts.push(`${entry.home.abbreviation} ${sign(o.spread.line)}`);
  if (o.total?.line != null) parts.push(`O/U ${o.total.line}`);
  if (o.moneyline?.home != null) parts.push(`ML ${entry.home.abbreviation} ${sign(o.moneyline.home)} / ${entry.away.abbreviation} ${sign(o.moneyline.away)}`);
  const m = entry.movement;
  const notes = [];
  if (m.spread) notes.push(`spread ${sign(m.spread)} since open`);
  if (m.total) notes.push(`total ${sign(m.total)} since open`);
  return parts.join('  ') + (notes.length ? `  (${notes.join(', ')})` : '');
}
