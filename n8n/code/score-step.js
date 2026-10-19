// Score-change logic for the n8n polling workflow. Plain JavaScript with no imports: build.mjs
// pastes this file into the workflow's Code nodes, and test/ runs it with node --test.

/** True when `team` (abbreviation or id, case-insensitive) plays in `game`. Empty team = every game. */
function involvesTeam(game, team) {
  if (!team) return true;
  const t = String(team).toLowerCase();
  return [game.homeTeam, game.awayTeam].some((x) => x && (String(x.id) === t || String(x.abbreviation || '').toLowerCase() === t));
}

function line(g) {
  const a = g.awayTeam || {};
  const h = g.homeTeam || {};
  return `${a.abbreviation || a.name} ${a.score ?? 0} - ${h.score ?? 0} ${h.abbreviation || h.name}`;
}

/**
 * One polling step. `state` is { scores: {eventId: 'away-home|state'}, initialised, nextCheck }.
 * `games` is the `data` array of GET /events (the scoreboard, which carries live scores too).
 * Returns { messages, state } where state.nextCheck (ms) says when the next API call is worth making:
 * 2 minutes while a game is live, ~5 minutes before the next start, else in 3 hours (max 6 hours).
 */
function scoreStep(state, games, team, now, { liveMs = 120000 } = {}) {
  const prev = (state && state.scores) || {};
  const initialised = Boolean(state && state.initialised);
  const scores = {};
  const messages = [];
  let live = false;
  let nextStart = null;
  for (const g of games || []) {
    if (!involvesTeam(g, team)) continue;
    const st = (g.status && g.status.state) || 'pre';
    const key = `${g.awayTeam?.score ?? 0}-${g.homeTeam?.score ?? 0}|${st}`;
    scores[g.id] = key;
    if (st === 'in') live = true;
    if (st === 'pre' && g.date) {
      const t = Date.parse(g.date);
      if (t > now && (nextStart === null || t < nextStart)) nextStart = t;
    }
    const old = prev[g.id];
    if (!initialised || old === key) continue;
    const detail = g.status?.detail ? ` (${g.status.detail})` : '';
    const oldState = old ? old.split('|')[1] : 'pre';
    if (st === 'in' && oldState === 'pre') messages.push(`🟢 Started: ${line(g)}${detail}`);
    else if (st === 'post' && oldState !== 'post') messages.push(`🏁 Final: ${line(g)}`);
    else if (st === 'in') messages.push(`🚨 Score: ${line(g)}${detail}`);
  }
  let wait;
  if (live) wait = liveMs;
  else if (nextStart !== null) wait = Math.max(nextStart - now - 300000, liveMs);
  else wait = 3 * 3600000;
  return { messages, state: { scores, initialised: true, nextCheck: now + Math.min(wait, 6 * 3600000) } };
}
