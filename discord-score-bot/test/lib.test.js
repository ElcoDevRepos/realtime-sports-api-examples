import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffScores, formatScore, idleSleepMs, involvesTeam, nextStartMs } from '../lib.js';

const game = (id, away, home, extra = {}) => ({
  id,
  awayTeam: { id: 'a' + id, abbreviation: 'KC', score: away },
  homeTeam: { id: 'h' + id, abbreviation: 'BAL', score: home },
  status: { state: 'in', detail: '5:23 - 2nd Quarter' },
  ...extra
});

test('formatScore puts the away team first', () => {
  assert.equal(formatScore(game('1', 14, 10)), '**KC 14 - 10 BAL**  (5:23 - 2nd Quarter)');
  assert.equal(formatScore(game('1', 0, 0, { status: {} }), 'LIVE: '), 'LIVE: **KC 0 - 0 BAL**');
});

test('involvesTeam matches abbreviation or id, case-insensitive', () => {
  assert.equal(involvesTeam(game('1', 0, 0), 'kc'), true);
  assert.equal(involvesTeam(game('1', 0, 0), 'h1'), true);
  assert.equal(involvesTeam(game('1', 0, 0), 'DAL'), false);
  assert.equal(involvesTeam(game('1', 0, 0), ''), true);
});

test('diffScores reports changes and finished games', () => {
  const prev = new Map([
    ['1', '7-7'],
    ['2', '0-3']
  ]);
  const { changes, finished, next } = diffScores(prev, [game('1', 14, 7), game('3', 0, 0)]);
  assert.deepEqual(changes.map((g) => g.id), ['1']);
  assert.deepEqual(finished, ['2']);
  assert.equal(next.get('3'), '0-0');
});

test('nextStartMs picks the earliest future pre-game', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const events = [
    { status: { state: 'pre' }, date: '2026-10-04T20:25Z' },
    { status: { state: 'pre' }, date: '2026-10-04T17:00Z' },
    { status: { state: 'post' }, date: '2026-10-04T13:00Z' }
  ];
  assert.equal(nextStartMs(events, now), Date.parse('2026-10-04T17:00Z'));
  assert.equal(nextStartMs([], now), null);
});

test('idleSleepMs sleeps until shortly before a distant game, capped', () => {
  const now = 0;
  const idleMs = 15 * 60_000;
  const maxIdleMs = 6 * 3_600_000;
  assert.equal(idleSleepMs({ nextStart: null, now, idleMs, maxIdleMs }), idleMs);
  assert.equal(idleSleepMs({ nextStart: 10 * 60_000, now, idleMs, maxIdleMs }), idleMs);
  assert.equal(idleSleepMs({ nextStart: 60 * 60_000, now, idleMs, maxIdleMs }), 58 * 60_000);
  assert.equal(idleSleepMs({ nextStart: 48 * 3_600_000, now, idleMs, maxIdleMs }), maxIdleMs);
});
