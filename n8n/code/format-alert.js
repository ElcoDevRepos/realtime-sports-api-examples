// Turns a Realtime Sports API webhook delivery { event, timestamp, data } into one line of text,
// or null to skip it. Plain JavaScript; build.mjs pastes it into the webhook workflow's Code node.
function formatAlert(payload) {
  const type = payload && payload.event;
  const d = (payload && payload.data) || {};
  if (!type) return null;
  const label = (t) => (t && (t.abbreviation || t.name)) || '?';
  const score = `${label(d.awayTeam)} ${d.awayTeam?.score ?? 0} - ${d.homeTeam?.score ?? 0} ${label(d.homeTeam)}`;
  const tag = d.league ? `[${String(d.league).toUpperCase()}] ` : '';
  switch (type) {
    case 'event.final':
      return `${tag}🏁 FINAL: ${score}`;
    case 'event.score_change':
      return `${tag}🚨 ${score}${d.status?.detail ? ` (${d.status.detail})` : ''}`;
    case 'event.live':
      return `${tag}🟢 LIVE: ${label(d.awayTeam)} @ ${label(d.homeTeam)}`;
    default:
      return null; // status changes and plays are frequent; add cases here if you want them
  }
}
