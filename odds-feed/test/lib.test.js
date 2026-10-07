import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, detectMoves, feedEntry, impliedProbability, normalizeOdds } from '../lib.js';

const odds = (line, total, mlHome, mlAway, extra = {}) => ({
  provider: 'Book',
  spread: { line, home: -110, away: -110 },
  moneyline: { home: mlHome, away: mlAway },
  overUnder: { total, over: -110, under: -110 },
  ...extra
});

test('normalizeOdds handles null and partial markets', () => {
  assert.equal(normalizeOdds(null), null);
  assert.equal(normalizeOdds({ provider: 'Book' }), null);
  const n = normalizeOdds({ provider: 'Book', overUnder: { total: 2.5, over: -140, under: 105 } });
  assert.deepEqual(n.total, { line: 2.5, over: -140, under: 105 });
  assert.equal(n.spread, null);
  assert.equal(n.impliedWin, null);
});

test('implied probability removes the margin', () => {
  assert.equal(impliedProbability(-110).toFixed(4), '0.5238');
  assert.equal(impliedProbability(150), 0.4);
  const n = normalizeOdds(odds(-8.5, 47.5, -455, 350));
  assert.ok(Math.abs(n.impliedWin.home + n.impliedWin.away - 1) < 1e-9);
  assert.equal(n.impliedWin.home, 0.787);
  assert.equal(normalizeOdds(odds(-0.5, 2.5, 135, 150), { twoWay: false }).impliedWin, null);
});

test('detectMoves sorts, dedupes and reports changes', () => {
  // Deliberately out of order, with a duplicate snapshot.
  const history = [
    { timestamp: '2026-10-07T10:27:16.199Z', odds: odds(-8.5, 47.5, -455, 350) },
    { timestamp: '2026-09-05T00:56:14.781Z', odds: odds(-3.5, 52.5, -205, 170) },
    { timestamp: '2026-10-07T10:27:16.177Z', odds: odds(-8.5, 47.5, -455, 350) }
  ];
  const { opening, moves, snapshots } = detectMoves(history);
  assert.equal(snapshots, 3);
  assert.equal(opening.odds.spread.line, -3.5);
  assert.deepEqual(
    moves.map((m) => [m.market, m.from, m.to]),
    [
      ['spread', -3.5, -8.5],
      ['total', 52.5, 47.5],
      ['moneyline.home', -205, -455],
      ['moneyline.away', 170, 350]
    ]
  );
});

test('feedEntry and describe for a game with and without odds', () => {
  const event = {
    id: '1',
    name: 'Tampa Bay Buccaneers at Dallas Cowboys',
    shortName: 'TB @ DAL',
    date: '2026-10-09T00:15Z',
    homeTeam: { id: '6', abbreviation: 'DAL' },
    awayTeam: { id: '27', abbreviation: 'TB' }
  };
  const e = feedEntry(event, odds(-8.5, 47.5, -455, 350), [
    { timestamp: '2026-09-05T00:00:00Z', odds: odds(-3.5, 52.5, -205, 170) },
    { timestamp: '2026-10-07T00:00:00Z', odds: odds(-8.5, 47.5, -455, 350) }
  ]);
  assert.equal(e.movement.spread, -5);
  assert.equal(e.movement.total, -5);
  assert.equal(e.movement.lineMoved, true);
  assert.equal(describe(e), 'TB @ DAL  DAL -8.5  O/U 47.5  ML DAL -455 / TB +350  (spread -5 since open, total -5 since open)');

  const none = feedEntry(event, null, []);
  assert.equal(none.odds, null);
  assert.equal(none.movement.lineMoved, false);
  assert.equal(describe(none), 'TB @ DAL  no odds available');
});
