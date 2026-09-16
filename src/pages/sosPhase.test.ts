import { test } from "node:test";
import assert from "node:assert/strict";
import { initialSosPhase, shouldConsumeAutoFlag } from "./sosPhase";

// RC-A: a voice auto-send arms the countdown once; a second mount (Back/reload
// onto the same /sos entry, after the flag was consumed) must start in confirm.

test("initialSosPhase: auto true arms the countdown", () => {
  assert.equal(initialSosPhase(true), "countdown");
});

test("initialSosPhase: auto false starts in confirm (Back/reload after consume)", () => {
  assert.equal(initialSosPhase(false), "confirm");
});

test("shouldConsumeAutoFlag: true only while the flag is still set", () => {
  assert.equal(shouldConsumeAutoFlag({ auto: true }), true);
  assert.equal(shouldConsumeAutoFlag({ auto: false }), false);
  assert.equal(shouldConsumeAutoFlag(null), false);
  assert.equal(shouldConsumeAutoFlag(undefined), false);
  assert.equal(shouldConsumeAutoFlag({}), false);
});
