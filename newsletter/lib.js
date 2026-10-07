// Pure helpers for the recap newsletter: stat leaders and Markdown/HTML rendering.
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

/** GET a path under /api/v1. Returns the envelope, or throws an Error with .status and .code. */
export async function apiGet(path, key, query = {}) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${body?.error?.code ?? ''}: ${body?.error?.message ?? 'request failed'}`);
    err.status = res.status;
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

const n = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const label = (t) => t?.abbreviation || t?.name || '?';

/**
 * Stat categories per sport. Box score player stats are strings; football nests them under
 * `categories`, other sports use flat keys.
 */
const CATEGORIES = {
  football: [
    { title: 'Passing', get: (p) => p.categories?.passing?.passingYards, fmt: (p) => `${p.categories.passing.passingYards} yds, ${p.categories.passing.passingTouchdowns ?? 0} TD` },
    { title: 'Rushing', get: (p) => p.categories?.rushing?.rushingYards, fmt: (p) => `${p.categories.rushing.rushingYards} yds, ${p.categories.rushing.rushingTouchdowns ?? 0} TD` },
    { title: 'Receiving', get: (p) => p.categories?.receiving?.receivingYards, fmt: (p) => `${p.categories.receiving.receptions ?? '?'} rec, ${p.categories.receiving.receivingYards} yds` }
  ],
  basketball: [
    { title: 'Points', get: (p) => p.points, fmt: (p) => `${p.points} pts, ${p.rebounds ?? 0} reb, ${p.assists ?? 0} ast` },
    { title: 'Rebounds', get: (p) => p.rebounds, fmt: (p) => `${p.rebounds} reb` },
    { title: 'Assists', get: (p) => p.assists, fmt: (p) => `${p.assists} ast` }
  ],
  baseball: [
    { title: 'RBIs', get: (p) => p.RBIs, fmt: (p) => `${p['hits-atBats'] ?? ''}, ${p.homeRuns ?? 0} HR, ${p.RBIs} RBI` },
    { title: 'Hits', get: (p) => p.hits, fmt: (p) => `${p['hits-atBats'] ?? p.hits}` }
  ],
  hockey: [
    { title: 'Goals', get: (p) => p.goals, fmt: (p) => `${p.goals} G, ${p.assists ?? 0} A` },
    { title: 'Assists', get: (p) => p.assists, fmt: (p) => `${p.assists} A` }
  ],
  soccer: [{ title: 'Goals', get: (p) => p.goals ?? p.totalGoals, fmt: (p) => `${p.goals ?? p.totalGoals} G` }]
};

/**
 * Leaders across a set of box scores: { [category]: [{ name, team, line, value }] } (top `top`).
 * `boxes` is [{ game, box }] where box is the /boxscore `data`.
 */
export function statLeaders(sport, boxes, top = 3) {
  const cats = CATEGORIES[sport] ?? [];
  const out = {};
  for (const cat of cats) {
    const rows = [];
    for (const { box } of boxes) {
      for (const [side, players] of [['homeTeam', box?.homePlayers], ['awayTeam', box?.awayPlayers]]) {
        for (const p of players ?? []) {
          const raw = cat.get(p);
          if (raw == null || raw === '') continue;
          rows.push({ name: p.name, team: label(box[side]), value: n(raw), line: cat.fmt(p) });
        }
      }
    }
    rows.sort((a, b) => b.value - a.value);
    const best = rows.filter((r) => r.value > 0).slice(0, top);
    if (best.length) out[cat.title] = best;
  }
  return out;
}

/** "ARI 24 @ **NYG 36**" with the winner in bold. `escape` lets the HTML renderer escape team names. */
export function finalLine(g, { bold = (s) => `**${s}**`, escape = (s) => s } = {}) {
  const a = g.awayTeam ?? {};
  const h = g.homeTeam ?? {};
  const as = escape(`${label(a)} ${a.score ?? 0}`);
  const hs = escape(`${label(h)} ${h.score ?? 0}`);
  const aw = (a.score ?? 0) > (h.score ?? 0);
  const hw = (h.score ?? 0) > (a.score ?? 0);
  return `${aw ? bold(as) : as} @ ${hw ? bold(hs) : hs}`;
}

/** Pre-game line. status.detail is already a readable local start time, e.g. "Thu, October 8th at 8:15 PM EDT". */
export function upcomingLine(g) {
  const venue = g.venue?.name ? ` · ${g.venue.name}${g.venue.city ? `, ${g.venue.city}` : ''}` : '';
  return `${label(g.awayTeam)} @ ${label(g.homeTeam)} · ${g.status?.detail ?? g.date}${venue}`;
}

export function renderMarkdown({ title, subtitle, finals, leaders, leadersNote, upcoming, footer }) {
  const lines = [`# ${title}`, '', `_${subtitle}_`, '', '## Final scores', ''];
  if (finals.length) for (const g of finals) lines.push(`- ${finalLine(g)}`);
  else lines.push('_No completed games in this window._');
  if (Object.keys(leaders).length) {
    lines.push('', '## Top performers', '');
    if (leadersNote) lines.push(`_${leadersNote}_`, '');
    for (const [cat, rows] of Object.entries(leaders)) {
      lines.push(`**${cat}**`, '');
      for (const r of rows) lines.push(`- ${r.name} (${r.team}): ${r.line}`);
      lines.push('');
    }
  } else lines.push('');
  lines.push('## Coming up', '');
  if (upcoming.length) for (const g of upcoming) lines.push(`- ${upcomingLine(g)}`);
  else lines.push('_Nothing scheduled in the current window._');
  lines.push('', '---', '', footer, '');
  return lines.join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Email-friendly HTML: a single table layout with inline styles, no external CSS or images. */
export function renderHtml({ title, subtitle, finals, leaders, leadersNote, upcoming, footer }) {
  const h2 = (t) => `<h2 style="font-size:18px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px">${esc(t)}</h2>`;
  const li = (html) => `<li style="margin:4px 0">${html}</li>`;
  const list = (items) => `<ul style="padding-left:20px;margin:0">${items.join('')}</ul>`;
  const em = (t) => `<p style="color:#666;margin:4px 0"><em>${esc(t)}</em></p>`;
  const parts = [
    `<h1 style="font-size:24px;margin:0 0 4px">${esc(title)}</h1>`,
    em(subtitle),
    h2('Final scores'),
    finals.length ? list(finals.map((g) => li(finalLine(g, { bold: (s) => `<strong>${s}</strong>`, escape: esc })))) : em('No completed games in this window.')
  ];
  if (Object.keys(leaders).length) {
    parts.push(h2('Top performers'));
    if (leadersNote) parts.push(em(leadersNote));
    for (const [cat, rows] of Object.entries(leaders)) {
      parts.push(`<p style="margin:12px 0 4px"><strong>${esc(cat)}</strong></p>`);
      parts.push(list(rows.map((r) => li(`${esc(r.name)} (${esc(r.team)}): ${esc(r.line)}`))));
    }
  }
  parts.push(h2('Coming up'));
  parts.push(upcoming.length ? list(upcoming.map((g) => li(esc(upcomingLine(g))))) : em('Nothing scheduled in the current window.'));
  parts.push(`<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 8px"><p style="color:#888;font-size:12px">${footer}</p>`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f6f6f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:6px">
<tr><td style="padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">
${parts.join('\n')}
</td></tr></table></td></tr></table>
</body></html>
`;
}
