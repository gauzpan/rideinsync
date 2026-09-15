import { test } from "node:test";
import assert from "node:assert/strict";
// The repo has no DOM test environment (no jsdom / testing-library), so the
// expand/collapse render path is verified in-browser. These lock the pure seams
// SosStrip is built on: the collapsed label, the red-dot rule, name truncation,
// and the short own-alert status the strip's "Help is coming · …" line uses.
import { buildSosStripLabel, hasUnseenAlerts, truncateName } from "./SosStrip";
import { buildOwnSosStatusShort, type Responder } from "../lib/sos";

const resp = (id: string, name: string, reachedAt: string | null = null): Responder => ({
  id,
  userId: `u-${id}`,
  name,
  reachedAt,
});

// ---- truncateName -----------------------------------------------------------

test("truncateName: an ≤18-char name is left untouched", () => {
  assert.equal(truncateName("Aarav"), "Aarav");
  assert.equal(truncateName("Eighteen chars her"), "Eighteen chars her"); // exactly 18
});

test("truncateName: a >18-char name is cut to 18 chars incl. the ellipsis", () => {
  const out = truncateName("Bartholomew Cuthbertson"); // 23 chars
  assert.equal(out, "Bartholomew Cuthb…");
  assert.equal([...out].length, 18);
  assert.ok(out.endsWith("…"));
});

// ---- buildSosStripLabel -----------------------------------------------------

test("label: one incoming alert → 'SOS · <name> needs help (1)'", () => {
  assert.equal(buildSosStripLabel([{ name: "Aarav" }], null), "SOS · Aarav needs help (1)");
});

test("label: several incoming alerts → count reflects all, name is the first", () => {
  assert.equal(
    buildSosStripLabel([{ name: "Aarav" }, { name: "Meera" }, { name: "Kabir" }], null),
    "SOS · Aarav needs help (3)",
  );
});

test("label: a long first-rider name is truncated inside the label", () => {
  assert.equal(
    buildSosStripLabel([{ name: "Bartholomew Cuthbertson" }], null),
    "SOS · Bartholomew Cuthb… needs help (1)",
  );
});

test("label: incoming wins over the viewer's own status", () => {
  assert.equal(
    buildSosStripLabel([{ name: "Aarav" }], "2 on the way"),
    "SOS · Aarav needs help (1)",
  );
});

test("label: own alert only → 'Help is coming · <status>'", () => {
  assert.equal(buildSosStripLabel([], "2 on the way"), "Help is coming · 2 on the way");
  assert.equal(
    buildSosStripLabel([], "Waiting for a response…"),
    "Help is coming · Waiting for a response…",
  );
});

test("label: nothing to show → null (strip unmounts)", () => {
  assert.equal(buildSosStripLabel([], null), null);
});

// ---- hasUnseenAlerts --------------------------------------------------------

test("unseen dot: lit when an alert id is not yet seen", () => {
  assert.equal(hasUnseenAlerts(["a1"], new Set()), true);
  assert.equal(hasUnseenAlerts(["a1", "a2"], new Set(["a1"])), true); // a2 still unseen
});

test("unseen dot: dark once every current id has been seen", () => {
  assert.equal(hasUnseenAlerts(["a1", "a2"], new Set(["a1", "a2"])), false);
  assert.equal(hasUnseenAlerts([], new Set(["a1"])), false); // no alerts → no dot
});

// ---- buildOwnSosStatusShort -------------------------------------------------

test("short status: no responders → waiting", () => {
  assert.equal(buildOwnSosStatusShort([]), "Waiting for a response…");
});

test("short status: one on the way → names them", () => {
  assert.equal(buildOwnSosStatusShort([resp("1", "Rajath K.")]), "Rajath K. is on the way");
});

test("short status: several on the way → bare count", () => {
  assert.equal(
    buildOwnSosStatusShort([resp("1", "Rajath K."), resp("2", "Meera")]),
    "2 on the way",
  );
});

test("short status: a reach beats on-the-way and names the reacher", () => {
  assert.equal(
    buildOwnSosStatusShort([resp("1", "Meera"), resp("2", "Rajath K.", "2026-09-16T10:00:00Z")]),
    "Rajath K. has reached you",
  );
});
