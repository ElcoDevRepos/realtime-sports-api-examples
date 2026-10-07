// Sign a sample delivery with WEBHOOK_SECRET and POST it to your running server, the same way the
// API does. Handy for local development before you have a public URL.
//
//   node send-sample.js [event.final|event.score_change|event.live] [http://localhost:3000/webhook]
import { loadDotEnv, sign } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));

export const SAMPLES = {
  'event.final': {
    eventId: '401872966',
    sport: 'football',
    league: 'nfl',
    name: 'Arizona Cardinals at New York Giants',
    homeTeam: { id: '19', name: 'New York Giants', abbreviation: 'NYG', score: 36 },
    awayTeam: { id: '22', name: 'Arizona Cardinals', abbreviation: 'ARI', score: 24 },
    status: { state: 'post', period: 4, detail: 'Final' }
  },
  'event.score_change': {
    eventId: '401872966',
    sport: 'football',
    league: 'nfl',
    name: 'Arizona Cardinals at New York Giants',
    homeTeam: { id: '19', name: 'New York Giants', abbreviation: 'NYG', score: 19 },
    awayTeam: { id: '22', name: 'Arizona Cardinals', abbreviation: 'ARI', score: 17 },
    previousScore: { home: 12, away: 17 }
  },
  'event.live': {
    eventId: '401872980',
    sport: 'football',
    league: 'nfl',
    name: 'Tampa Bay Buccaneers at Dallas Cowboys',
    homeTeam: { id: '6', name: 'Dallas Cowboys', abbreviation: 'DAL', score: 0 },
    awayTeam: { id: '27', name: 'Tampa Bay Buccaneers', abbreviation: 'TB', score: 0 },
    status: { state: 'in', period: 1, detail: '15:00 - 1st Quarter' }
  }
};

export async function sendSample(url, secret, event = 'event.final') {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: SAMPLES[event] });
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Event': event, 'X-Webhook-Signature': sign(body, secret) },
    body
  });
}

if (process.argv[1]?.endsWith('send-sample.js')) {
  const event = process.argv[2] || 'event.final';
  const url = process.argv[3] || `http://localhost:${process.env.PORT || 3000}${process.env.WEBHOOK_PATH || '/webhook'}`;
  if (!SAMPLES[event]) {
    console.error(`Unknown sample ${event}. Choose one of: ${Object.keys(SAMPLES).join(', ')}`);
    process.exit(1);
  }
  if (!process.env.WEBHOOK_SECRET) {
    console.error('Set WEBHOOK_SECRET first (any string works for local testing, as long as the server uses the same one).');
    process.exit(1);
  }
  const res = await sendSample(url, process.env.WEBHOOK_SECRET, event);
  console.log(`POST ${url} -> HTTP ${res.status} ${await res.text()}`);
}
