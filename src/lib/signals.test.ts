import { test } from "node:test";
import assert from "node:assert/strict";
import { signalsCount } from "./signals";

test("signalsCount: open (unresolved) SOS alerts + signal-log length", () => {
  assert.equal(signalsCount([], []), 0);
  assert.equal(signalsCount([], [{}, {}, {}]), 3);
  assert.equal(signalsCount([{ resolved: false }], []), 1);
  // Resolved alerts don't count toward the header badge.
  assert.equal(signalsCount([{ resolved: true }], []), 0);
  assert.equal(
    signalsCount([{ resolved: false }, { resolved: true }, { resolved: false }], [{}, {}]),
    4,
  );
});
