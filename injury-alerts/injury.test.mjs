// node --test injury.test.mjs   (filtering + formatting; no network)
import test from "node:test"; import assert from "node:assert/strict";
import { interesting, format, sinceToIso } from "./injury-alerts.mjs";
const row = (o) => ({ name: "A Player", position: "WR", teamName: "Team", availability: "OUT", ...o });
test("designation changes alert, note-only updates don't", () => {
  assert.equal(interesting(row({ changeType: "change", previousAvailability: "QUESTIONABLE" })), true);
  assert.equal(!!interesting(row({ changeType: "change", previousAvailability: "OUT" })), false);
  assert.equal(interesting(row({ changeType: "change", previousAvailability: "OUT" }), true), true);
  assert.equal(interesting(row({ changeType: "new" })), true);
  assert.equal(interesting(row({ changeType: "cleared" })), true);
});
test("format", () => {
  assert.match(format(row({ changeType: "change", previousAvailability: "QUESTIONABLE" })), /Questionable → Out/);
  assert.match(format(row({ changeType: "cleared" })), /off the injury report/);
});
test("since", () => { assert.equal(sinceToIso("2h", Date.UTC(2026, 0, 1, 12)), "2026-01-01T10:00:00.000Z"); });
