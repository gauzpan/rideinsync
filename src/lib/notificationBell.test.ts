import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bellColorFor,
  popoverReducer,
  publishBellEvent,
  publishBellRidePath,
  markBellSeen,
  _getBellState,
  _resetBell,
  type BellEvent,
  type PopoverState,
} from "./notificationBell";

function ev(id: string, kind: BellEvent["kind"]): BellEvent {
  return { id, kind, at: 1 };
}

test("bellColorFor: sos beats hazard beats regroup/pitstop beats none", () => {
  assert.equal(bellColorFor([]), "none");
  assert.equal(bellColorFor([{ kind: "pitstop" }]), "ok");
  assert.equal(bellColorFor([{ kind: "regroup" }]), "ok");
  assert.equal(bellColorFor([{ kind: "hazard" }]), "warn");
  assert.equal(bellColorFor([{ kind: "sos" }]), "danger");
  // Priority when several are unseen at once.
  assert.equal(bellColorFor([{ kind: "regroup" }, { kind: "hazard" }]), "warn");
  assert.equal(bellColorFor([{ kind: "hazard" }, { kind: "sos" }, { kind: "pitstop" }]), "danger");
});

test("publishBellEvent accumulates unseen and tracks latest", () => {
  _resetBell();
  publishBellEvent(ev("a", "hazard"));
  publishBellEvent(ev("b", "sos"));
  const s = _getBellState();
  assert.equal(s.unseen.length, 2);
  assert.equal(s.latest?.id, "b");
});

test("publishBellEvent dedupes by id (a re-fetch does not relight)", () => {
  _resetBell();
  publishBellEvent(ev("a", "hazard"));
  publishBellEvent(ev("a", "hazard"));
  publishBellEvent(ev("a", "hazard"));
  assert.equal(_getBellState().unseen.length, 1);
});

test("markBellSeen clears unseen, and a seen id never relights", () => {
  _resetBell();
  publishBellEvent(ev("a", "sos"));
  markBellSeen();
  assert.equal(_getBellState().unseen.length, 0);
  // Same id arriving again (e.g. a re-fetch) must not re-add it.
  publishBellEvent(ev("a", "sos"));
  assert.equal(_getBellState().unseen.length, 0);
});

test("publishBellRidePath(null) clears unseen (ride ended); a real path keeps them", () => {
  _resetBell();
  publishBellEvent(ev("a", "hazard"));
  publishBellRidePath("/ride/ride-1");
  assert.equal(_getBellState().ridePath, "/ride/ride-1");
  assert.equal(_getBellState().unseen.length, 1);
  publishBellRidePath(null);
  assert.equal(_getBellState().ridePath, null);
  assert.equal(_getBellState().unseen.length, 0);
});

test("publishBellRidePath upgrades member path to the ops /lead path without clearing unseen", () => {
  _resetBell();
  publishBellEvent(ev("a", "sos"));
  // Role resolves after the first publish: plain path first, then /lead.
  publishBellRidePath("/ride/ride-1");
  publishBellRidePath("/ride/ride-1/lead");
  assert.equal(_getBellState().ridePath, "/ride/ride-1/lead");
  // A non-null → non-null change must NOT clear unseen (only path → null does).
  assert.equal(_getBellState().unseen.length, 1);
});

test("publishBellEvent never throws before a subscriber mounts", () => {
  _resetBell();
  assert.doesNotThrow(() => publishBellEvent(ev("x", "regroup")));
});

test("popoverReducer: event opens, a new event replaces + restarts, dismiss/timeout close", () => {
  const closed: PopoverState = { open: false, event: null };
  const first = popoverReducer(closed, { type: "event", e: ev("a", "hazard") });
  assert.equal(first.open, true);
  assert.equal(first.event?.id, "a");

  // A new event while open replaces the text (the component restarts the timer).
  const second = popoverReducer(first, { type: "event", e: ev("b", "sos") });
  assert.equal(second.open, true);
  assert.equal(second.event?.id, "b");

  assert.deepEqual(popoverReducer(second, { type: "dismiss" }), closed);
  assert.deepEqual(popoverReducer(second, { type: "timeout" }), closed);
});
