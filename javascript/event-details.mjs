// One game: details, box score and the latest plays (3 API calls).
// Usage: node event-details.mjs <sport> <league> <eventId>
// Find event ids with live-scores.mjs (printed in [brackets]).
import { apiGet, formatGame, run } from './lib.mjs';

const [sport, league, eventId] = process.argv.slice(2);
if (!eventId) {
  console.error('Usage: node event-details.mjs <sport> <league> <eventId>   (e.g. football nfl 401772982)');
  process.exit(1);
}

run(async () => {
  const base = `/sports/${sport}/leagues/${league}/events/${eventId}`;
  const { data: event } = await apiGet(base);
  console.log(formatGame(event));

  const { data: box } = await apiGet(`${base}/boxscore`);
  console.log('\nBox score keys:', Object.keys(box ?? {}).join(', '));

  const { data: plays } = await apiGet(`${base}/plays`, { limit: 10 });
  console.log('\nPlays:');
  for (const p of plays ?? []) console.log(` - ${p.text ?? JSON.stringify(p).slice(0, 120)}`);
});
