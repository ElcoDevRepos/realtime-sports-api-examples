import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectGoals, goalMessage, hornFor, involvesTeam, latestScoringPlay } from '../lib.js';

// A real /events response for the NHL, captured on 18 Oct 2026 (one final, one live game).
const fixture = JSON.parse(readFileSync(new URL('./nhl-events.fixture.json', import.meta.url)));
const live = fixture.data.find((g) => g.status.state === 'in');
const withScore = (g, away, home) => ({ ...g, awayTeam: { ...g.awayTeam, score: away }, homeTeam: { ...g.homeTeam, score: home } });

test('first sighting is a silent baseline', () => {
  const { goals, next } = detectGoals(new Map(), [live]);
  assert.deepEqual(goals, []);
  assert.deepEqual(next.get(live.id), { away: live.awayTeam.score, home: live.homeTeam.score });
});

test('a score increase is a goal for that side', () => {
  const { next } = detectGoals(new Map(), [withScore(live, 1, 0)]);
  const { goals } = detectGoals(next, [withScore(live, 1, 1)]);
  assert.equal(goals.length, 1);
  assert.equal(goals[0].side, 'home');
  assert.equal(goals[0].team.abbreviation, 'CGY');
  assert.equal(goals[0].kind, 'goal');
});

test('a score decrease is an overturned goal', () => {
  const { next } = detectGoals(new Map(), [withScore(live, 2, 1)]);
  const { goals } = detectGoals(next, [withScore(live, 1, 1)]);
  assert.equal(goals[0].kind, 'overturned');
  assert.match(goalMessage(goals[0]), /^❌ CAR goal taken off the board\. CAR 1 - 1 CGY/);
});

test('picks the latest scoring play, preferring the scoring team', () => {
  const plays = [
    { id: '1', scoringPlay: true, teamId: '7', text: 'Goal A' },
    { id: '2', scoringPlay: false, teamId: '3', text: 'Shot' },
    { id: '3', scoringPlay: true, teamId: '3', text: 'Goal B' },
    { id: '4', scoringPlay: false, teamId: '7', text: 'Faceoff' }
  ];
  assert.equal(latestScoringPlay(plays, '7').text, 'Goal A');
  assert.equal(latestScoringPlay(plays, null).text, 'Goal B');
  assert.equal(latestScoringPlay(plays, '99').text, 'Goal B');
  assert.equal(latestScoringPlay([], '7'), null);
});

test('goal message includes the score, clock and scorer', () => {
  const g = withScore(live, 2, 1);
  const msg = goalMessage({ game: g, team: g.awayTeam, kind: 'goal' }, { text: 'Sebastian Aho (5) Wrist Shot' });
  assert.equal(msg, `🚨 CAR GOAL! CAR 2 - 1 CGY (${live.status.detail}) · Sebastian Aho (5) Wrist Shot`);
});

test('horn only for the followed team goals', () => {
  const goal = { kind: 'goal', team: live.awayTeam };
  assert.equal(hornFor(goal, 'car'), true);
  assert.equal(hornFor(goal, 'CGY'), false);
  assert.equal(hornFor(goal, ''), true);
  assert.equal(hornFor({ ...goal, kind: 'overturned' }, 'CAR'), false);
  assert.equal(involvesTeam(live, 'cgy'), true);
});
