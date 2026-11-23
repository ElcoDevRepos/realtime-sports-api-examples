#!/usr/bin/env node
// Close-game alerts: post to a Discord or Slack webhook when an NBA, NHL or NFL game gets tight late,
// goes to overtime, and when it ends. Node 18+, no dependencies.
//
// Rules (change them in RULES):
//   NBA  4th quarter or overtime, 5 minutes or less left, within 5 points
//   NHL  3rd period, within one goal (overtime always alerts)
//   NFL  4th quarter or overtime, 5 minutes or less left, within 8 points (one score)
// Each game alerts at most once per stage ("close", "overtime", "final"), so a back-and-forth finish
// doesn't flood the channel.
//
//   node close-game-alerts.mjs --league nba                # poll every 60 s
//   node close-game-alerts.mjs --league nhl,nba --every 30
//   node close-game-alerts.mjs --league nba --once --dry-run
//
// Env: REALTIME_SPORTS_API_KEY (required), WEBHOOK_URL (Discord or Slack incoming webhook; omit to print).
// Live, in-progress scores need the free 7-day trial (no card) or a paid plan: on the Free plan
// /events/live answers 403 LIVE_DATA_REQUIRES_TRIAL. One call per league per poll, only while games are on.
import { readFileSync, existsSync } from "node:fs";

const API = process.env.RSA_API_BASE || "https://www.realtimesportsapi.com/api/v1";
export const RULES = {
  nba: { sport: "basketball", latePeriod: 4, maxSecondsLeft: 300, margin: 5 },
  nhl: { sport: "hockey", latePeriod: 3, maxSecondsLeft: null, margin: 1 },
  nfl: { sport: "football", latePeriod: 4, maxSecondsLeft: 300, margin: 8 },
};
const OT_FROM = { nba: 5, nhl: 4, nfl: 5 };

function loadDotenv() {
  for (const f of [new URL("./.env", import.meta.url), `${process.cwd()}/.env`]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

/** "4:32" -> 272, "45.2" -> 45.2, anything else -> null */
export function secondsLeft(clock) {
  const s = String(clock ?? "").trim();
  let m = /^(\d+):(\d{1,2})(?:\.\d+)?$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)$/.exec(s);
  return m ? Number(m[1]) : null;
}

/** Which stage (if any) a game is in: "overtime" | "close" | "final" | null */
export function stage(league, ev) {
  const r = RULES[league], st = ev.status ?? {};
  const a = Number(ev.awayTeam?.score ?? 0), h = Number(ev.homeTeam?.score ?? 0);
  if (st.state === "post" || st.completed) return "final";
  if (st.state !== "in") return null;
  const period = Number(st.period ?? 0);
  if (period >= OT_FROM[league]) return "overtime";
  if (period < r.latePeriod || Math.abs(a - h) > r.margin) return null;
  if (r.maxSecondsLeft == null) return "close";
  const left = secondsLeft(st.clock);
  return left != null && left <= r.maxSecondsLeft ? "close" : null;
}

export function message(league, ev, kind) {
  const a = ev.awayTeam ?? {}, h = ev.homeTeam ?? {};
  const line = `${a.abbreviation ?? a.name} ${a.score ?? 0} – ${h.score ?? 0} ${h.abbreviation ?? h.name}`;
  const detail = ev.status?.detail ?? "";
  const icon = { close: "🔥", overtime: "⏱️", final: "🏁" }[kind];
  const label = { close: "Close game", overtime: "Overtime", final: "Final" }[kind];
  return `${icon} ${label} (${league.toUpperCase()}): ${line} · ${detail}`;
}

async function api(path, key) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${j.error?.code ?? ""}: ${j.error?.message ?? ""}`);
  return j.data ?? [];
}

async function post(url, text) {
  const slack = /hooks\.slack\.com/.test(url);
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(slack ? { text } : { content: text }) });
  if (!r.ok) console.error(`webhook HTTP ${r.status}`);
}

async function main() {
  loadDotenv();
  const key = process.env.REALTIME_SPORTS_API_KEY;
  if (!key) throw new Error("Set REALTIME_SPORTS_API_KEY (or put it in .env). Free key + 7-day trial: https://www.realtimesportsapi.com/signup");
  const argv = process.argv.slice(2), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const leagues = opt("--league", "nba").split(",");
  for (const l of leagues) if (!RULES[l]) throw new Error(`--league must be from ${Object.keys(RULES).join(", ")}`);
  const every = Number(opt("--every", 60)), once = argv.includes("--once"), dry = argv.includes("--dry-run") || !process.env.WEBHOOK_URL;
  const sent = new Map(); // "<league>:<eventId>" -> Set of stages already alerted
  const live = new Map(); // games seen live, so we can send their final once
  for (;;) {
    for (const league of leagues) {
      try {
        const events = await api(`/sports/${RULES[league].sport}/leagues/${league}/events/live`, key);
        const ids = new Set(events.map((e) => e.id));
        for (const ev of events) live.set(`${league}:${ev.id}`, ev);
        // A game that drops out of /events/live has ended: fetch it once for the final score.
        for (const [k, ev] of live) {
          if (!k.startsWith(league + ":") || ids.has(ev.id)) continue;
          live.delete(k);
          if (!sent.get(k)?.size) continue; // only report finals of games we alerted on
          const fin = (await api(`/sports/${RULES[league].sport}/leagues/${league}/events/${ev.id}`, key).catch(() => null)) ?? ev;
          events.push(Array.isArray(fin) ? fin[0] : fin);
        }
        for (const ev of events) {
          const kind = stage(league, ev), k = `${league}:${ev.id}`;
          if (!kind || sent.get(k)?.has(kind)) continue;
          if (kind === "final" && !sent.get(k)?.size) continue;
          sent.set(k, new Set([...(sent.get(k) ?? []), kind]));
          const text = message(league, ev, kind);
          if (dry) console.log(text); else await post(process.env.WEBHOOK_URL, text);
        }
        console.log(`${new Date().toISOString()} ${league}: ${events.length} live`);
      } catch (e) { console.error(`${league}: ${e.message}`); }
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, every * 1000));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
