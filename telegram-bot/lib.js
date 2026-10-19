// Helpers for the Telegram live-score bot. Network-free except apiGet/sendTelegram, so the diff
// and formatting logic can be unit tested with `node --test`.
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

export const teamLabel = (t) => t?.abbreviation || t?.name || '?';

/** True when `team` (abbreviation or id, case-insensitive) is playing in `game`. Empty team = every game. */
export function involvesTeam(game, team) {
  if (!team) return true;
  const t = String(team).toLowerCase();
  return [game.homeTeam, game.awayTeam].some((x) => x && (String(x.id) === t || String(x.abbreviation ?? '').toLowerCase() === t));
}

/**
 * Compare the previous snapshot map (eventId -> { away, home }) with the games live now.
 * Returns started / scored games, finished event ids, and the next snapshot map. On the first poll
 * (`initialised: false`) nothing is reported, so a restart mid-game does not re-announce everything.
 */
export function diffGames(prev, games, { initialised = true } = {}) {
  const next = new Map();
  const started = [];
  const scored = [];
  for (const g of games) {
    const snap = { away: g.awayTeam?.score ?? 0, home: g.homeTeam?.score ?? 0 };
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

/** Escape text for Telegram's HTML parse mode. */
export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PREFIX = { start: '🟢 Started', score: '🚨 Score', final: '🏁 Final', info: '📅' };

/** Telegram message (HTML parse mode) for one game: "🚨 Score: <b>CAR 2 - 1 CGY</b> (13:12 - 2nd Period)". */
export function telegramText(game, kind = 'score', league = '') {
  const a = game.awayTeam ?? {};
  const h = game.homeTeam ?? {};
  const line = game.status?.state === 'pre'
    ? `${teamLabel(a)} @ ${teamLabel(h)}`
    : `${teamLabel(a)} ${a.score ?? 0} - ${h.score ?? 0} ${teamLabel(h)}`;
  const detail = game.status?.detail || (kind === 'final' ? 'Final' : '');
  const tag = league ? ` · ${league.toUpperCase()}` : '';
  return `${PREFIX[kind] ?? ''}: <b>${escapeHtml(line)}</b>${detail ? ` (${escapeHtml(detail)})` : ''}${tag}`.replace(/^: /, '');
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

/** Send one message through the Telegram Bot API. Retries once when Telegram rate-limits (429). */
export async function sendTelegram(token, chatId, text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return true;
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, (body.parameters?.retry_after ?? 1) * 1000));
      continue;
    }
    console.error(`Telegram sendMessage failed: HTTP ${res.status} ${body.description ?? ''}`);
    return false;
  }
  return false;
}
