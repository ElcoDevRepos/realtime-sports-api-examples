import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffGames, escapeHtml, idleSleepMs, involvesTeam, nextStartMs, telegramText } from '../lib.js';

// A real /events response for the NHL, captured on 18 Oct 2026 (one final, one live game).
const fixture = JSON.parse(readFileSync(new URL('./nhl-events.fixture.json', import.meta.url)));
const [finalGame, liveGame] = fixture.data;

test('formats a live game from a real response', () => {
  const { awayTeam: a, homeTeam: h } = liveGame;
  assert.equal(telegramText(liveGame, 'score', 'nhl'), `🚨 Score: <b>CAR ${a.score} - ${h.score} CGY</b> (13:12 - 2nd Period) · NHL`);
  assert.match(telegramText(finalGame, 'final'), /^🏁 Final: <b>CBJ \d+ - \d+ MIN<\/b> \(Final\)$/);
});

test('pre-game messages show the matchup, not 0-0', () => {
  const g = { ...liveGame, status: { state: 'pre', detail: 'Tue, October 20th at 7:00 PM EDT' } };
  assert.equal(telegramText(g, 'info'), '📅: <b>CAR @ CGY</b> (Tue, October 20th at 7:00 PM EDT)');
});

test('escapes HTML in team names and details', () => {
  assert.equal(escapeHtml('A&M <b>'), 'A&amp;M &lt;b&gt;');
});

test('filters by team abbreviation or id', () => {
  assert.equal(involvesTeam(liveGame, 'car'), true);
  assert.equal(involvesTeam(liveGame, String(liveGame.homeTeam.id)), true);
  assert.equal(involvesTeam(liveGame, 'BOS'), false);
  assert.equal(involvesTeam(liveGame, ''), true);
});

test('first poll is a silent baseline, later polls report changes', () => {
  const first = diffGames(new Map(), [liveGame], { initialised: false });
  assert.deepEqual([first.started, first.scored, first.finished], [[], [], []]);
  const goal = { ...liveGame, homeTeam: { ...liveGame.homeTeam, score: liveGame.homeTeam.score + 1 } };
  const second = diffGames(first.next, [goal]);
  assert.deepEqual(second.scored.map((g) => g.id), [liveGame.id]);
  const third = diffGames(second.next, []);
  assert.deepEqual(third.finished, [liveGame.id]);
});

test('idle sleep waits until shortly before the next game, capped', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const events = [{ status: { state: 'pre' }, date: '2026-10-20T15:00:00Z' }, { status: { state: 'post' }, date: '2026-10-19T23:00:00Z' }];
  const next = nextStartMs(events, now);
  assert.equal(next, Date.parse('2026-10-20T15:00:00Z'));
  assert.equal(idleSleepMs({ nextStart: next, now, idleMs: 900_000, maxIdleMs: 6 * 3_600_000 }), 3 * 3_600_000 - 120_000);
  assert.equal(idleSleepMs({ nextStart: null, now, idleMs: 900_000, maxIdleMs: 1 }), 900_000);
});
