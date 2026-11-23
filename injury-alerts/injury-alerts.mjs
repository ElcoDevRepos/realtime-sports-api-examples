#!/usr/bin/env node
// Injury report alerts: post NFL / NBA / NHL availability changes for your teams to a Discord or Slack
// webhook (or just print them). Node 18+, no dependencies.
//
// Reads GET /sports/{sport}/leagues/{league}/player-availability/history?since=… (newest first). By default it
// alerts when a player is added to the report, comes off it, or their designation changes (e.g. QUESTIONABLE ->
// OUT); --all also sends updates where only the note or return date changed.
//
//   node injury-alerts.mjs --league nfl --team KC,BUF            # poll every 10 minutes
//   node injury-alerts.mjs --league nba --since 24h --dry-run    # print the last day's changes, no webhook
//   node injury-alerts.mjs --league nhl --once                   # one check (for cron)
//
// Env: REALTIME_SPORTS_API_KEY (required), WEBHOOK_URL (Discord or Slack incoming webhook; omit to print only).
// Cost: one call per league per check (10-minute polling = 144 calls a day per league).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const API = process.env.RSA_API_BASE || "https://www.realtimesportsapi.com/api/v1";
const SPORT = { nfl: "football", nba: "basketball", nhl: "hockey" };
const STATE = new URL("./.injury-alerts-state.json", import.meta.url);

function loadDotenv() {
  for (const f of [new URL("./.env", import.meta.url), `${process.cwd()}/.env`]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function args(argv) {
  const a = { league: "nfl", teams: [], every: 10, since: "1h", once: false, dryRun: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--league") a.league = v, i++;
    else if (k === "--team") a.teams = v.split(",").map((s) => s.trim().toUpperCase()), i++;
    else if (k === "--every") a.every = Number(v), i++;
    else if (k === "--since") a.since = v, i++;
    else if (k === "--once") a.once = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--all") a.all = true;
  }
  if (!SPORT[a.league]) throw new Error(`--league must be one of ${Object.keys(SPORT).join(", ")}`);
  return a;
}

/** "24h" / "90m" / ISO date -> ISO timestamp */
export function sinceToIso(s, now = Date.now()) {
  const m = /^(\d+)([hm])$/.exec(s);
  return m ? new Date(now - Number(m[1]) * (m[2] === "h" ? 3600e3 : 60e3)).toISOString() : new Date(s).toISOString();
}

async function api(path, key) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${j.error?.code ?? ""}: ${j.error?.message ?? ""}`);
  return j;
}

/** Abbreviation -> team id, so --team KC works (the history rows carry teamId and teamName). */
async function teamIds(sport, league, abbrs, key) {
  if (!abbrs.length) return null;
  const j = await api(`/sports/${sport}/leagues/${league}/teams?limit=200`, key);
  const ids = new Set();
  for (const t of j.data ?? []) if (abbrs.includes(String(t.abbreviation).toUpperCase())) ids.add(String(t.id));
  if (ids.size !== abbrs.length) console.warn(`warning: matched ${ids.size} of ${abbrs.length} teams (${abbrs.join(",")})`);
  return ids;
}

/** Which rows are worth an alert. */
export function interesting(row, all = false) {
  if (all) return true;
  if (row.changeType === "new" || row.changeType === "cleared") return true;
  return row.changeType === "change" && row.previousAvailability && row.previousAvailability !== row.availability;
}

const pretty = (s) => String(s ?? "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export function format(row) {
  const who = `${row.name}${row.position ? ` (${row.position})` : ""}, ${row.teamName}`;
  if (row.changeType === "cleared") return `✅ ${who}: off the injury report`;
  const what = row.changeType === "new" ? `added as ${pretty(row.availability)}` :
    row.previousAvailability && row.previousAvailability !== row.availability ? `${pretty(row.previousAvailability)} → ${pretty(row.availability)}` : `still ${pretty(row.availability)} (update)`;
  const note = row.detail && row.detail !== "Not Specified" ? `\n> ${row.detail}` : "";
  const back = row.returnDate ? ` · expected back ${row.returnDate}` : "";
  return `🩹 ${who}: ${what}${back}${note}`;
}

/** Discord wants {content}, Slack wants {text}; both cap message size, so batch lines under 1,900 characters. */
async function post(url, lines) {
  const slack = /hooks\.slack\.com/.test(url);
  let chunk = [];
  const flush = async () => {
    if (!chunk.length) return;
    const text = chunk.join("\n");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(slack ? { text } : { content: text }) });
    if (!r.ok) console.error(`webhook HTTP ${r.status}`);
    chunk = [];
  };
  for (const l of lines) {
    if ([...chunk, l].join("\n").length > 1900) await flush();
    chunk.push(l.slice(0, 1900));
  }
  await flush();
}

async function check(a, key, ids, state) {
  const sport = SPORT[a.league];
  const since = state.since ?? sinceToIso(a.since);
  const j = await api(`/sports/${sport}/leagues/${a.league}/player-availability/history?since=${encodeURIComponent(since)}&limit=500`, key);
  if ((j.data ?? []).length >= 500) console.warn("warning: 500 changes in one check (the maximum); use a shorter --since or check more often");
  const rows = (j.data ?? []).filter((r) => r.observedAt > since && (!ids || ids.has(String(r.teamId))));
  const hits = rows.filter((r) => interesting(r, a.all)).reverse(); // oldest first
  const newest = (j.data ?? [])[0]?.observedAt;
  if (newest && newest > since) state.since = newest;
  if (hits.length) {
    const lines = hits.map(format);
    if (a.dryRun || !process.env.WEBHOOK_URL) console.log(lines.join("\n"));
    else await post(process.env.WEBHOOK_URL, lines);
  }
  console.log(`${new Date().toISOString()} ${a.league}: ${rows.length} changes since ${since}, ${hits.length} alerted`);
}

async function main() {
  loadDotenv();
  const key = process.env.REALTIME_SPORTS_API_KEY;
  if (!key) throw new Error("Set REALTIME_SPORTS_API_KEY (or put it in .env). Free key: https://www.realtimesportsapi.com/signup");
  const a = args(process.argv.slice(2));
  const ids = await teamIds(SPORT[a.league], a.league, a.teams, key);
  const state = !a.dryRun && existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8"))[a.league] ?? {} : {};
  const save = () => { if (a.dryRun) return; const all = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {}; all[a.league] = state; writeFileSync(STATE, JSON.stringify(all)); };
  for (;;) {
    try { await check(a, key, ids, state); save(); } catch (e) { console.error(String(e.message ?? e)); }
    if (a.once || a.dryRun) return;
    await new Promise((r) => setTimeout(r, a.every * 60e3));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
