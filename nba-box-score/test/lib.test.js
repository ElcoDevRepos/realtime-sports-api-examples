import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { milestonesFor, newMilestones, playerLine, playerStats, renderBox, topPlayers } from '../lib.js';

const box = JSON.parse(readFileSync(new URL('./box.fixture.json', import.meta.url)));
const [guard, center, bench] = box.homePlayers;

test('normalises numbers and made-attempted strings', () => {
  const s = playerStats(guard);
  assert.deepEqual([s.pts, s.reb, s.ast, s.stl, s.fg, s.three, s.min], [31, 6, 11, 2, '11-22', '4-9', '36']);
  assert.equal(playerStats(bench).pts, 0);
});

test('player line', () => {
  assert.equal(playerLine(guard), 'Home Guard  31 PTS  6 REB  11 AST  (11-22 FG, 4-9 3PT, 36 MIN)');
  assert.equal(playerLine({ name: 'Bare', points: 2 }), 'Bare  2 PTS  0 REB  0 AST');
});

test('top players skip DNPs and sort by points', () => {
  assert.deepEqual(topPlayers(box.homePlayers).map((p) => p.name), ['Home Guard', 'Home Center']);
});

test('milestones: points thresholds, double-double, triple-double', () => {
  assert.deepEqual(milestonesFor(guard).map((m) => m.id), ['20pts', '30pts', 'double-double']);
  assert.deepEqual(milestonesFor(center).map((m) => m.id), ['double-double']);
  assert.deepEqual(milestonesFor(box.awayPlayers[0]).map((m) => m.id), ['20pts', 'triple-double']);
});

test('alerts once per player per milestone, honouring the watch list', () => {
  const seen = new Set();
  const first = newMilestones('401', box, seen, { watch: ['home guard'] });
  assert.deepEqual(first.map((a) => a.milestone.id), ['20pts', '30pts', 'double-double']);
  assert.match(first[1].text, /^🏀 Home Guard \(DET\) has 30\+ points: /);
  assert.deepEqual(newMilestones('401', box, seen, { watch: ['home guard'] }), []);
  assert.equal(newMilestones('401', box, seen).length, 3); // the other players, now that the watch list is empty
});

test('renders a readable box score', () => {
  const text = renderBox(box, { status: { detail: 'Final' } });
  assert.match(text, /^BOS 99 @ DET 104  ·  Final/);
  assert.match(text, /BOS   30  22  21  26/);
  assert.ok(!text.includes('Home Bench'));
});
