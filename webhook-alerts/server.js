// Receives Realtime Sports API webhook deliveries, verifies X-Webhook-Signature, and prints (and
// optionally forwards) an alert for each one. Node 18+, no dependencies.
//
//   node server.js        listens on PORT (default 3000) at POST /webhook
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { formatAlert, loadDotEnv, verifySignature } from './lib.js';

const MAX_BODY = 1024 * 1024;

/**
 * Create the HTTP server. Options:
 *   secret      the webhook signing secret (required)
 *   path        URL path to accept deliveries on (default /webhook)
 *   only        array of event types to alert on (default: all)
 *   onAlert     called with (text, payload) for every verified delivery that produces an alert
 */
export function createAlertServer({ secret, path = '/webhook', only = null, onAlert = console.log }) {
  if (!secret) throw new Error('WEBHOOK_SECRET is required');
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url.split('?')[0] !== path) return reply(res, 404, { error: 'not found' });

    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reply(res, 413, { error: 'payload too large' });
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const raw = Buffer.concat(chunks); // verify the exact bytes received, before JSON.parse
      if (!verifySignature(raw, req.headers['x-webhook-signature'], secret)) {
        return reply(res, 401, { error: 'invalid signature' });
      }
      let payload;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply(res, 400, { error: 'invalid JSON' });
      }
      // Answer fast; do slow work (forwarding) after responding so the delivery is not retried.
      reply(res, 200, { received: true });
      const text = formatAlert(payload, only);
      if (text) Promise.resolve(onAlert(text, payload, req.headers)).catch((e) => console.error('alert handler failed:', e.message));
    });
  });
}

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Post the alert to a Slack or Discord incoming webhook (both accept this body shape). */
async function forward(url, text) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, content: text })
  });
  if (!res.ok) console.error(`Forward failed: HTTP ${res.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadDotEnv(new URL('./.env', import.meta.url));
  const env = process.env;
  if (!env.WEBHOOK_SECRET) {
    console.error('Set WEBHOOK_SECRET (the signing secret returned when you created the webhook). See .env.example.');
    process.exit(1);
  }
  const only = env.ALERT_EVENTS ? env.ALERT_EVENTS.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const port = Number(env.PORT || 3000);
  createAlertServer({
    secret: env.WEBHOOK_SECRET,
    path: env.WEBHOOK_PATH || '/webhook',
    only,
    onAlert: async (text, payload, headers) => {
      const test = headers['x-webhook-test'] === 'true' ? ' (test delivery)' : '';
      console.log(`${new Date().toISOString()} ${text}${test}`);
      if (env.FORWARD_URL) await forward(env.FORWARD_URL, text);
    }
  }).listen(port, () => console.log(`Listening on http://localhost:${port}${env.WEBHOOK_PATH || '/webhook'}`));
}
