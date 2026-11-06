// Poll the live endpoint and print only what changed: score, clock/period, final.
// Usage: node watch.mjs [sport] [league] [seconds]
//   node watch.mjs basketball nba 30
// Every poll is one API call: a 3-hour game polled every 30 s is about 360 calls.
// Data is typically 20-30 seconds behind live play; not for in-play betting.
import { apiGet, formatGame, run } from './lib.mjs';

const [sport = 'football', league = 'nfl', seconds = '30'] = process.argv.slice(2);
const last = new Map(); // event id -> last line printed

async function poll() {
  const { data: games } = await apiGet(`/sports/${sport}/leagues/${league}/events/live`);
  for (const g of games) {
    const line = formatGame(g);
    if (last.get(g.id) !== line) {
      console.log(`${new Date().toLocaleTimeString()}  ${line}`);
      last.set(g.id, line);
    }
  }
  if (!games.length && last.size === 0) console.log(`No ${league} games live right now.`);
}

run(async () => {
  await poll();
  setInterval(() => poll().catch((e) => console.error(e.message)), Number(seconds) * 1000);
});
