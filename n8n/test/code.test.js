import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (file, fn) => new Function(readFileSync(new URL(`../code/${file}`, import.meta.url), 'utf8') + `\nreturn ${fn};`)();
const scoreStep = load('score-step.js', 'scoreStep');
const formatAlert = load('format-alert.js', 'formatAlert');

// A real NHL /events response captured on 18 Oct 2026: CBJ @ MIN final, CAR @ CGY live.
const fixture = JSON.parse(readFileSync(new URL('./nhl-events.fixture.json', import.meta.url))).data;
const NOW = Date.parse('2026-10-19T01:00:00Z');
const bump = (games, id, side) => games.map((g) => (g.id === id ? { ...g, [side]: { ...g[side], score: g[side].score + 1 } } : g));

test('first run is a silent baseline and polls again in 2 minutes while live', () => {
  const { messages, state } = scoreStep({}, fixture, 'CAR', NOW);
  assert.deepEqual(messages, []);
  assert.equal(state.initialised, true);
  assert.equal(state.nextCheck, NOW + 120000);
});

test('score change, final and start messages', () => {
  const live = fixture.find((g) => g.status.state === 'in');
  const s1 = scoreStep({}, fixture, 'CAR', NOW).state;
  const goal = bump(fixture, live.id, 'homeTeam');
  const r2 = scoreStep(s1, goal, 'CAR', NOW);
  assert.equal(r2.messages.length, 1);
  assert.match(r2.messages[0], /^🚨 Score: CAR \d+ - \d+ CGY \(.+Period\)$/);
  const ended = goal.map((g) => (g.id === live.id ? { ...g, status: { state: 'post', detail: 'Final' } } : g));
  const r3 = scoreStep(r2.state, ended, 'CAR', NOW);
  assert.match(r3.messages[0], /^🏁 Final: CAR/);
  assert.equal(r3.state.nextCheck, NOW + 3 * 3600000); // nothing live or upcoming: check every 3 hours
  const pre = fixture.map((g) => ({ ...g, status: { state: 'pre', detail: 'Later' }, date: '2026-10-19T03:00:00Z' }));
  const s4 = scoreStep({}, pre, '', NOW).state;
  assert.equal(s4.nextCheck, Date.parse('2026-10-19T02:55:00Z')); // 5 minutes before the start
  const r5 = scoreStep(s4, fixture, '', NOW);
  assert.ok(r5.messages.some((m) => m.startsWith('🟢 Started: CAR')));
});

test('team filter ignores other games', () => {
  const s1 = scoreStep({}, fixture, 'BOS', NOW).state;
  assert.deepEqual(s1.scores, {});
  const live = fixture.find((g) => g.status.state === 'in');
  assert.deepEqual(scoreStep(s1, bump(fixture, live.id, 'awayTeam'), 'BOS', NOW).messages, []);
});

test('formats webhook deliveries and skips noisy types', () => {
  const data = { league: 'nfl', homeTeam: { abbreviation: 'NYG', score: 19 }, awayTeam: { abbreviation: 'ARI', score: 17 }, status: { detail: '2:00 - 4th Quarter' } };
  assert.equal(formatAlert({ event: 'event.score_change', data }), '[NFL] 🚨 ARI 17 - 19 NYG (2:00 - 4th Quarter)');
  assert.equal(formatAlert({ event: 'event.final', data }), '[NFL] 🏁 FINAL: ARI 17 - 19 NYG');
  assert.equal(formatAlert({ event: 'event.play', data }), null);
  assert.equal(formatAlert(undefined), null);
});

test('built workflows are valid and embed the tested code', () => {
  for (const f of ['poll-score-alerts.json', 'webhook-score-alerts.json']) {
    const wf = JSON.parse(readFileSync(new URL(`../workflows/${f}`, import.meta.url), 'utf8'));
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const [from, c] of Object.entries(wf.connections)) {
      assert.ok(names.has(from), from);
      for (const t of c.main.flat()) assert.ok(names.has(t.node), t.node);
    }
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) new Function('$getWorkflowStaticData', '$input', n.parameters.jsCode); // parses
    assert.ok(!JSON.stringify(wf).match(/Bearer [A-Za-z0-9]/), 'no key in the workflow');
  }
});
