// Games in progress right now for one league.
// Usage: node live-scores.mjs [sport] [league]
//   node live-scores.mjs football nfl
//   node live-scores.mjs soccer eng.1     (soccer is "soccer"; "football" is American football)
import { apiGet, formatGame, run } from './lib.mjs';

const [sport = 'football', league = 'nfl'] = process.argv.slice(2);

run(async () => {
  const { data: games, meta } = await apiGet(`/sports/${sport}/leagues/${league}/events/live`);
  if (!games.length) console.log(`No ${league} games live right now.`);
  for (const g of games) console.log(formatGame(g));
  if (meta?.rateLimit) console.log(`\nCalls remaining this month: ${meta.rateLimit.remaining}`);
});
