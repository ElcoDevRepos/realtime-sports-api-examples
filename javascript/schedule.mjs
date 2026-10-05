// Season schedule. NFL and college football also take a week.
// Usage: node schedule.mjs [sport] [league] [season] [week] [seasonType]
//   node schedule.mjs football nfl 2026 5 2    (2026 regular season, week 5)
import { apiGet, formatGame, run } from './lib.mjs';

const [sport = 'football', league = 'nfl', season = '2026', week, seasonType = '2'] = process.argv.slice(2);

run(async () => {
  const { data: games } = await apiGet(`/sports/${sport}/leagues/${league}/seasons/${season}/schedule`, { week, seasonType });
  for (const g of games) console.log(`${new Date(g.date).toLocaleString()}  ${formatGame(g)}`);
  console.log(`\n${games.length} games`);
});
