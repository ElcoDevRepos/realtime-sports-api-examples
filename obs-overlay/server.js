// Score overlay for OBS (or any streaming tool with a browser source). Node 18+, no dependencies.
//
//   node server.js     serves http://localhost:3030/?league=nba&team=BOS
//
// The browser source only talks to this server, so your API key never leaves your machine, and
// every viewer/scene shares one cached upstream request (30 s while live, longer otherwise).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { SLUG, apiGet, createCache, loadDotEnv, pickGame, toOverlay, ttlFor } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
loadDotEnv(new URL('../.env', import.meta.url));

const KEY = process.env.REALTIME_SPORTS_API_KEY;
const PORT = Number(process.env.PORT || 3030);
const HOST = process.env.HOST || '127.0.0.1'; // local only by default
if (!KEY || KEY === 'your_api_key_here') {
  console.error('Set REALTIME_SPORTS_API_KEY (see .env.example). Free key: https://www.realtimesportsapi.com/signup');
  process.exit(1);
}

const overlayHtml = readFileSync(new URL('./public/overlay.html', import.meta.url));
const cached = createCache();
const SPORT_OF = { nfl: 'football', 'college-football': 'football', nba: 'basketball', 'mens-college-basketball': 'basketball', mlb: 'baseball', nhl: 'hockey' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/' || url.pathname === '/overlay') return send(res, 200, overlayHtml, 'text/html; charset=utf-8');
    if (url.pathname !== '/score') return send(res, 404, { error: 'not found' });

    const league = (url.searchParams.get('league') || 'nba').toLowerCase();
    const sport = (url.searchParams.get('sport') || SPORT_OF[league] || 'soccer').toLowerCase();
    const team = (url.searchParams.get('team') || '').slice(0, 40);
    if (!SLUG.test(league) || !SLUG.test(sport)) return send(res, 400, { error: 'bad sport or league' });

    try {
      const game = await cached(`${sport}/${league}/${team.toLowerCase()}`, async () => {
        const { data } = await apiGet(`/sports/${sport}/leagues/${league}/events`, KEY);
        const picked = pickGame(data, team);
        console.error(new Date().toISOString(), `fetched ${sport}/${league}${team ? ` ${team}` : ''}: ${picked?.shortName ?? 'no game'}`);
        return { value: toOverlay(picked), ttl: ttlFor(picked) };
      });
      send(res, 200, game);
    } catch (err) {
      console.error(err.message);
      send(res, err.status === 429 ? 429 : 502, { error: err.status === 429 ? 'monthly quota used up' : 'upstream error' });
    }
  })
  .listen(PORT, HOST, () => console.error(`Overlay on http://${HOST}:${PORT}/?league=nba&team=BOS`));
