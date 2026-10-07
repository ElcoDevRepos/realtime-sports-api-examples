// Manage your Realtime Sports API webhooks (paid plans only). Node 18+, no dependencies.
//
//   node register.js create https://your-host.example.com/webhook [--leagues nfl,nba] [--events event.final,event.score_change]
//   node register.js list
//   node register.js test <webhookId> [event.final]   sends a signed sample delivery to your URL
//   node register.js delete <webhookId>
import { loadDotEnv } from './lib.js';

loadDotEnv(new URL('./.env', import.meta.url));
loadDotEnv(new URL('../.env', import.meta.url));

const API = process.env.RSA_API_BASE || 'https://www.realtimesportsapi.com/api/v1';
const KEY = process.env.REALTIME_SPORTS_API_KEY;
const DEFAULT_EVENTS = ['event.live', 'event.score_change', 'event.final'];

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    if (res.status === 403) die(`HTTP 403 ${e.code ?? ''}: ${e.message ?? ''}\nWebhooks need a paid plan: https://www.realtimesportsapi.com/pricing`);
    die(`HTTP ${res.status} ${e.code ?? ''}: ${e.message ?? 'request failed'}`);
  }
  return json;
}

const [cmd, ...args] = process.argv.slice(2);
if (!KEY || KEY === 'your_api_key_here') die('Set REALTIME_SPORTS_API_KEY (see .env.example).');

switch (cmd) {
  case 'create': {
    const url = args[0];
    if (!url || !/^https:\/\//.test(url)) die('Usage: node register.js create https://your-host/webhook [--leagues nfl,nba] [--events ...]');
    const events = (flag(args, '--events') ?? DEFAULT_EVENTS.join(',')).split(',').map((s) => s.trim());
    const leagues = flag(args, '--leagues')?.split(',').map((s) => s.trim());
    const { data } = await call('POST', '/webhooks', { url, events, ...(leagues ? { leagues } : {}) });
    console.log(`Created webhook ${data.id} -> ${data.url}`);
    console.log(`Events: ${data.events.join(', ')}   Leagues: ${data.leagues?.join(', ') ?? 'all'}`);
    console.log(`\nSigning secret (shown only now; put it in .env as WEBHOOK_SECRET):\n${data.secret}`);
    break;
  }
  case 'list': {
    const { data } = await call('GET', '/webhooks');
    if (!data.length) console.log('No webhooks.');
    for (const w of data) {
      console.log(`${w.id}  ${w.active ? 'active  ' : 'inactive'}  ${w.url}  [${w.events.join(', ')}]  leagues: ${w.leagues?.join(', ') ?? 'all'}`);
    }
    break;
  }
  case 'test': {
    if (!args[0]) die('Usage: node register.js test <webhookId> [eventType]');
    const { data } = await call('POST', `/webhooks/${args[0]}/test`, args[1] ? { eventType: args[1] } : {});
    if (data.delivered) console.log(`Delivered (HTTP ${data.statusCode}, ${data.durationMs} ms)`);
    else console.log(`Not delivered: HTTP ${data.statusCode ?? '-'} ${String(data.error ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
    break;
  }
  case 'delete': {
    if (!args[0]) die('Usage: node register.js delete <webhookId>');
    await call('DELETE', `/webhooks/${args[0]}`);
    console.log(`Deleted ${args[0]}`);
    break;
  }
  default:
    die('Usage: node register.js create <https-url> [--leagues nfl] [--events event.final] | list | test <id> | delete <id>');
}
