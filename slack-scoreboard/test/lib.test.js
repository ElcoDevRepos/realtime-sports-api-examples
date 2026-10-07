import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffGames, idleSleepMs, nextStartMs, scoreLine, slackPayload } from '../lib.js';

const game = (id, away, home, extra = {}) => ({
  id,
  awayTeam: { abbreviation: 'TB', score: away },
  homeTeam: { abbreviation: 'DAL', score: home },
  status: { state: 'in', detail: '5:23 - 2nd Quarter' },
  ...extra
});

test('first poll only records a baseline', () => {
  const { started, scored, finished, next } = diffGames(new Map(), [game('1', 0, 7)], { initialised: false });
  assert.deepEqual([started, scored, finished], [[], [], []]);
  assert.deepEqual(next.get('1'), { away: 0, home: 7, state: 'in' });
});

test('reports started, scored and finished games', () => {
  const prev = new Map([
    ['1', { away: 7, home: 7, state: 'in' }],
    ['2', { away: 0, home: 3, state: 'in' }]
  ]);
  const { started, scored, finished } = diffGames(prev, [game('1', 14, 7), game('3', 0, 0)]);
  assert.deepEqual(started.map((g) => g.id), ['3']);
  assert.deepEqual(scored.map((g) => g.id), ['1']);
  assert.deepEqual(finished, ['2']);
});

test('an unchanged score is not reported', () => {
  const prev = new Map([['1', { away: 14, home: 7, state: 'in' }]]);
  const { scored } = diffGames(prev, [game('1', 14, 7, { status: { state: 'in', detail: 'Halftime' } })]);
  assert.equal(scored.length, 0);
});

test('scoreLine hides the 0-0 placeholder before kickoff', () => {
  assert.equal(scoreLine(game('1', 0, 0, { status: { state: 'pre' } })), 'TB @ DAL');
  assert.equal(scoreLine(game('1', 21, 24)), 'TB 21 - 24 DAL');
});

test('slackPayload has fallback text and blocks', () => {
  const p = slackPayload(game('1', 14, 10), 'score', 'nfl');
  assert.equal(p.text, ':rotating_light: Score: TB 14 - 10 DAL (5:23 - 2nd Quarter)');
  assert.equal(p.blocks[0].text.text, ':rotating_light: Score  *TB 14 - 10 DAL*');
  assert.equal(p.blocks[1].elements[0].text, 'NFL · 5:23 - 2nd Quarter');
  const f = slackPayload(game('1', 21, 24, { status: { state: 'post' } }), 'final');
  assert.equal(f.text, ':checkered_flag: Final: TB 21 - 24 DAL (Final)');
});

test('idle scheduling sleeps until shortly before the next game, capped', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const events = [
    { status: { state: 'pre' }, date: '2026-10-09T00:15Z' },
    { status: { state: 'post' }, date: '2026-10-08T01:00Z' }
  ];
  const next = nextStartMs(events, now);
  assert.equal(next, Date.parse('2026-10-09T00:15Z'));
  const idleMs = 15 * 60_000;
  assert.equal(idleSleepMs({ nextStart: next, now, idleMs, maxIdleMs: 6 * 3_600_000 }), 6 * 3_600_000);
  assert.equal(idleSleepMs({ nextStart: now + 60 * 60_000, now, idleMs, maxIdleMs: 6 * 3_600_000 }), 58 * 60_000);
  assert.equal(idleSleepMs({ nextStart: null, now, idleMs, maxIdleMs: 1 }), idleMs);
});
