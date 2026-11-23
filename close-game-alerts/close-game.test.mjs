// node --test close-game.test.mjs   (rules only; no network)
import test from "node:test"; import assert from "node:assert/strict";
import { secondsLeft, stage } from "./close-game-alerts.mjs";
const ev = (state, period, clock, a, h) => ({ status: { state, period, clock }, awayTeam: { score: a }, homeTeam: { score: h } });
test("clock parsing", () => { assert.equal(secondsLeft("4:32"), 272); assert.equal(secondsLeft("45.2"), 45.2); assert.equal(secondsLeft("0:00"), 0); assert.equal(secondsLeft(""), null); });
test("nba", () => {
  assert.equal(stage("nba", ev("in", 4, "4:59", 100, 104)), "close");
  assert.equal(stage("nba", ev("in", 4, "5:01", 100, 104)), null);
  assert.equal(stage("nba", ev("in", 4, "2:00", 100, 107)), null);
  assert.equal(stage("nba", ev("in", 3, "1:00", 100, 100)), null);
  assert.equal(stage("nba", ev("in", 5, "4:00", 110, 101)), "overtime");
  assert.equal(stage("nba", ev("post", 4, "0:00", 1, 2)), "final");
});
test("nhl", () => {
  assert.equal(stage("nhl", ev("in", 3, "15:00", 2, 3)), "close");
  assert.equal(stage("nhl", ev("in", 3, "1:00", 1, 3)), null);
  assert.equal(stage("nhl", ev("in", 2, "1:00", 2, 2)), null);
  assert.equal(stage("nhl", ev("in", 4, "3:00", 2, 2)), "overtime");
});
test("nfl", () => { assert.equal(stage("nfl", ev("in", 4, "3:10", 17, 24)), "close"); assert.equal(stage("nfl", ev("in", 4, "3:10", 14, 24)), null); });
