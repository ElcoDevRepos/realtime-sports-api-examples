import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLUG, createCache, pickGame, toOverlay, ttlFor } from '../lib.js';

// Real /events responses captured on 18 Oct 2026: NBA (three upcoming games) and NHL (one final, one live).
const nba = JSON.parse(readFileSync(new URL('./nba-events.fixture.json', import.meta.url))).data;
const nhl = JSON.parse(readFileSync(new URL('./nhl-events.fixture.json', import.meta.url))).data;
const NOW = Date.parse('2026-10-19T01:00:00Z');

test('picks the live game first', () => {
  assert.equal(pickGame(nhl, '', NOW).status.state, 'in');
  assert.equal(pickGame(nhl, 'cgy', NOW).homeTeam.abbreviation, 'CGY');
});

test('picks the most recent final for a team that has finished', () => {
  assert.equal(pickGame(nhl, 'MIN', NOW).status.state, 'post');
});

test('picks the next upcoming game for a team', () => {
  const g = pickGame(nba, 'ny', NOW);
  assert.equal(g.shortName, 'PHI @ NY');
  assert.equal(pickGame(nba, 'LAL', NOW), null);
});

test('overlay object has abbreviations, scores and colours, no logos', () => {
  const o = toOverlay(pickGame(nhl, 'CAR', NOW));
  assert.deepEqual(Object.keys(o), ['id', 'state', 'detail', 'away', 'home']);
  assert.equal(o.away.abbr, 'CAR');
  assert.match(o.away.color, /^#[0-9a-f]{6}$/i);
  assert.ok(!JSON.stringify(o).includes('logo'));
  assert.deepEqual(toOverlay(null), { state: 'none' });
});

test('cache TTL follows the game state', () => {
  assert.equal(ttlFor({ status: { state: 'in' } }), 30_000);
  assert.equal(ttlFor({ status: { state: 'post' } }), 600_000);
  const soon = { status: { state: 'pre' }, date: new Date(NOW + 7 * 60_000).toISOString() };
  assert.equal(ttlFor(soon, NOW), 120_000);
  const later = { status: { state: 'pre' }, date: new Date(NOW + 5 * 3_600_000).toISOString() };
  assert.equal(ttlFor(later, NOW), 600_000);
  assert.equal(ttlFor(null), 600_000);
});

test('cache serves hits and coalesces concurrent misses', async () => {
  let t = 0;
  let loads = 0;
  const cached = createCache(() => t);
  const load = async () => ({ value: ++loads, ttl: 1000 });
  const [a, b] = await Promise.all([cached('k', load), cached('k', load)]);
  assert.deepEqual([a, b, loads], [1, 1, 1]);
  t = 999;
  assert.equal(await cached('k', load), 1);
  t = 1001;
  assert.equal(await cached('k', load), 2);
});

test('only plain slugs reach the upstream path', () => {
  assert.ok(SLUG.test('mens-college-basketball') && SLUG.test('eng.1'));
  for (const bad of ['..', '../admin', 'nba/x', 'a..b', '.nba', 'NBA', '']) assert.equal(SLUG.test(bad), false, bad);
});
