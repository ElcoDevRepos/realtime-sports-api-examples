// Shared helpers for the JavaScript examples. Node 18+ (uses the built-in fetch), no dependencies.
import { existsSync, readFileSync } from 'node:fs';

export const API_BASE = process.env.RSA_API_BASE || 'https://www.realtimesportsapi.com/api/v1';

// Load ../.env (KEY=value lines) if present; variables already in the environment win.
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

export function requireKey() {
  const key = process.env.REALTIME_SPORTS_API_KEY;
  if (!key || key === 'your_api_key_here') {
    console.error('Set REALTIME_SPORTS_API_KEY first (export it, or copy .env.example to .env).');
    console.error('Get a free key at https://www.realtimesportsapi.com/signup');
    process.exit(1);
  }
  return key;
}

export class ApiError extends Error {
  constructor(status, body) {
    const err = body?.error ?? {};
    super(`HTTP ${status} ${err.code ?? ''}: ${err.message ?? 'request failed'}`.trim());
    this.status = status;
    this.code = err.code;
    this.hint = err.hint;
    this.retryAfter = undefined;
  }
}

/**
 * GET a path under /api/v1 and return the parsed envelope `{ success, data, meta }`.
 * Throws ApiError on non-2xx responses (401 bad key, 429 monthly quota exhausted, ...).
 */
export async function apiGet(path, query = {}) {
  const key = requireKey();
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new ApiError(res.status, body);
    e.retryAfter = Number(res.headers.get('retry-after')) || undefined;
    throw e;
  }
  return body;
}

/** One-line score: "KC 14 @ BAL 10  5:23 - 2nd Quarter" */
export function formatGame(g) {
  const a = g.awayTeam ?? {};
  const h = g.homeTeam ?? {};
  const score = (t) => (t.score === undefined || t.score === null ? '' : ` ${t.score}`);
  return `${a.abbreviation ?? a.name ?? '?'}${score(a)} @ ${h.abbreviation ?? h.name ?? '?'}${score(h)}  ${g.status?.detail ?? ''}  [${g.id}]`;
}

/** Run an async main() and print API errors cleanly instead of a stack trace. */
export function run(main) {
  main().catch((err) => {
    if (err instanceof ApiError) {
      console.error(err.message);
      if (err.hint) console.error(`Hint: ${err.hint}`);
      if (err.status === 429) console.error(`Monthly quota exhausted. Retry after ${err.retryAfter ?? '?'} s or upgrade.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
