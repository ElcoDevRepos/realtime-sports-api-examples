import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalLine, renderHtml, renderMarkdown, statLeaders, upcomingLine } from '../lib.js';

const final = {
  id: '1',
  awayTeam: { abbreviation: 'ARI', score: 24 },
  homeTeam: { abbreviation: 'NYG', score: 36 },
  status: { state: 'post', detail: 'Final' }
};
const pre = {
  id: '2',
  awayTeam: { abbreviation: 'TB' },
  homeTeam: { abbreviation: 'DAL' },
  status: { state: 'pre', detail: 'Thu, October 8th at 8:15 PM EDT' },
  venue: { name: 'AT&T Stadium', city: 'Arlington' }
};

test('finalLine bolds the winner', () => {
  assert.equal(finalLine(final), 'ARI 24 @ **NYG 36**');
  assert.equal(finalLine({ ...final, homeTeam: { abbreviation: 'NYG', score: 24 } }), 'ARI 24 @ NYG 24');
});

test('upcomingLine uses the readable start time and venue', () => {
  assert.equal(upcomingLine(pre), 'TB @ DAL · Thu, October 8th at 8:15 PM EDT · AT&T Stadium, Arlington');
});

test('football leaders parse string stats from nested categories', () => {
  const box = {
    homeTeam: { abbreviation: 'NYG' },
    awayTeam: { abbreviation: 'ARI' },
    homePlayers: [
      { name: 'QB One', categories: { passing: { passingYards: '250', passingTouchdowns: '3' } } },
      { name: 'RB One', categories: { rushing: { rushingYards: '58', rushingTouchdowns: '0' } } }
    ],
    awayPlayers: [{ name: 'QB Two', categories: { passing: { passingYards: '301', passingTouchdowns: '1' } } }]
  };
  const leaders = statLeaders('football', [{ game: final, box }]);
  assert.deepEqual(leaders.Passing.map((r) => [r.name, r.team, r.line]), [
    ['QB Two', 'ARI', '301 yds, 1 TD'],
    ['QB One', 'NYG', '250 yds, 3 TD']
  ]);
  assert.equal(leaders.Rushing[0].line, '58 yds, 0 TD');
  assert.equal(leaders.Receiving, undefined);
});

test('basketball leaders use flat keys', () => {
  const box = { homeTeam: { abbreviation: 'MEM' }, awayTeam: { abbreviation: 'IND' }, homePlayers: [{ name: 'A', points: '17', rebounds: '2', assists: '1' }], awayPlayers: [] };
  assert.equal(statLeaders('basketball', [{ box }]).Points[0].line, '17 pts, 2 reb, 1 ast');
});

test('markdown and html render all sections and escape HTML', () => {
  const doc = { title: 'NFL Week 4 recap', subtitle: 'x', finals: [final], leaders: {}, upcoming: [pre], footer: 'f' };
  const md = renderMarkdown(doc);
  assert.match(md, /## Final scores\n\n- ARI 24 @ \*\*NYG 36\*\*/);
  assert.match(md, /## Coming up\n\n- TB @ DAL/);
  const html = renderHtml(doc);
  assert.match(html, /ARI 24 @ <strong>NYG 36<\/strong>/);
  assert.match(html, /AT&amp;T Stadium/);
  assert.doesNotMatch(html, /AT&T/);
});
