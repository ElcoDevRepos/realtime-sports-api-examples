import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createAlertServer } from '../server.js';
import { formatAlert, sign, verifySignature } from '../lib.js';
import { SAMPLES, sendSample } from '../send-sample.js';

const SECRET = 'whsec_test_only';
const alerts = [];
let server;
let url;

before(async () => {
  server = createAlertServer({ secret: SECRET, onAlert: (text) => alerts.push(text) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/webhook`;
});
after(() => server.close());

test('verifySignature accepts the exact HMAC and rejects anything else', () => {
  const body = '{"event":"event.final"}';
  const sig = sign(body, SECRET);
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(verifySignature(body, sig, SECRET), true);
  assert.equal(verifySignature(body, sig.toUpperCase(), SECRET), true);
  assert.equal(verifySignature(body + ' ', sig, SECRET), false);
  assert.equal(verifySignature(body, sign(body, 'other'), SECRET), false);
  assert.equal(verifySignature(body, `sha256=${sig}`, SECRET), false);
  assert.equal(verifySignature(body, undefined, SECRET), false);
});

test('a correctly signed delivery is accepted and alerted', async () => {
  const res = await sendSample(url, SECRET, 'event.final');
  assert.equal(res.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.equal(alerts.at(-1), '[NFL] FINAL: ARI 24 - 36 NYG');
});

test('a delivery signed with the wrong secret is rejected', async () => {
  const before = alerts.length;
  const res = await sendSample(url, 'wrong-secret', 'event.final');
  assert.equal(res.status, 401);
  assert.equal(alerts.length, before);
});

test('a tampered body is rejected', async () => {
  const body = JSON.stringify({ event: 'event.final', data: SAMPLES['event.final'] });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': sign(body, SECRET) },
    body: body.replace('36', '63')
  });
  assert.equal(res.status, 401);
});

test('unknown paths are 404', async () => {
  const res = await fetch(url.replace('/webhook', '/nope'), { method: 'POST', body: '{}' });
  assert.equal(res.status, 404);
});

test('formatAlert covers each event type', () => {
  assert.equal(formatAlert({ event: 'event.score_change', data: SAMPLES['event.score_change'] }), '[NFL] SCORE: ARI 17 - 19 NYG (was 17-12)');
  assert.equal(formatAlert({ event: 'event.live', data: SAMPLES['event.live'] }), '[NFL] LIVE: TB @ DAL');
  assert.equal(
    formatAlert({ event: 'event.status_change', data: { league: 'nba', name: 'Lakers at Celtics', status: { state: 'in', detail: 'Halftime' } } }),
    '[NBA] Lakers at Celtics: Halftime'
  );
  assert.equal(formatAlert({ event: 'event.play', data: { play: { text: 'Touchdown' } } }), 'PLAY: Touchdown');
  assert.equal(formatAlert({ event: 'event.play', data: {} }, ['event.final']), null);
});
