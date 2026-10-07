// Signature verification and alert formatting for Realtime Sports API webhook deliveries.
// No network I/O here, so it is easy to unit test.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/** Minimal .env loader (KEY=value lines). Variables already in the environment win. */
export function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

/** Lowercase hex HMAC-SHA256 of the raw body, exactly what the API sends in X-Webhook-Signature. */
export function sign(rawBody, secret) {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * True when `signatureHeader` is the HMAC of the raw body bytes. Compare in constant time, and
 * always against the raw bytes you received (re-serialising parsed JSON changes the bytes).
 */
export function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  const received = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const expected = Buffer.from(sign(rawBody, secret), 'hex');
  return timingSafeEqual(expected, Buffer.from(received, 'hex'));
}

const label = (t) => t?.abbreviation || t?.name || '?';
const score = (d) => `${label(d.awayTeam)} ${d.awayTeam?.score ?? 0} - ${d.homeTeam?.score ?? 0} ${label(d.homeTeam)}`;

/**
 * Turn a delivery `{ event, timestamp, data }` into a one-line alert, or null to ignore it.
 * `only` optionally restricts which event types produce alerts.
 */
export function formatAlert(payload, only = null) {
  const type = payload?.event;
  const d = payload?.data ?? {};
  if (!type || (only && !only.includes(type))) return null;
  const tag = d.league ? `[${String(d.league).toUpperCase()}] ` : '';
  switch (type) {
    case 'event.final':
      return `${tag}FINAL: ${score(d)}`;
    case 'event.score_change': {
      const prev = d.previousScore ? ` (was ${d.previousScore.away}-${d.previousScore.home})` : '';
      return `${tag}SCORE: ${score(d)}${prev}`;
    }
    case 'event.live':
      return `${tag}LIVE: ${d.awayTeam ? `${label(d.awayTeam)} @ ${label(d.homeTeam)}` : d.name ?? d.eventId}`;
    case 'event.status_change':
      return `${tag}${d.name ?? d.eventId}: ${d.status?.detail ?? d.status?.state ?? 'status changed'}`;
    case 'event.play':
      return `${tag}PLAY: ${d.play?.text ?? d.play?.shortText ?? '(no text)'}`;
    default:
      return `${tag}${type}: ${d.name ?? d.eventId ?? ''}`.trim();
  }
}
