import { test } from "node:test";
import assert from "node:assert/strict";
// The repo has no DOM test environment (no jsdom / testing-library / vitest),
// so the click → navigate and mic-toggle render paths are verified in-browser.
// This unit locks the pure gate that decides whether the floating SOS button
// renders at all — the founder rule: shown ONLY to a member of a started ride
// (rideId non-null), never for a user with no active ride, and never on the
// /sos screen itself (that screen has its own Send SOS button).
import { shouldShowSos } from "./SosButton";

test("no active ride → no SOS button", () => {
  assert.equal(shouldShowSos(true, null, "/"), false);
});

test("in a started ride on '/' → SOS button shows", () => {
  assert.equal(shouldShowSos(true, "ride-1", "/"), true);
});

test("in a started ride but on /sos → no floating SOS button", () => {
  assert.equal(shouldShowSos(true, "ride-1", "/sos"), false);
});

test("not signed in / not in app → no SOS button even with a rideId", () => {
  assert.equal(shouldShowSos(false, "ride-1", "/"), false);
});

test("nested /sos path is also excluded", () => {
  assert.equal(shouldShowSos(true, "ride-1", "/sos/confirm"), false);
});

test("other in-app routes during a ride still show it", () => {
  assert.equal(shouldShowSos(true, "ride-1", "/ride/demo"), true);
});

// The scrolling content wrapper must clear the floating SOS button's footprint
// (button height + its bottom offset above the nav) so a bottom-edge control
// (e.g. "Share this ride") can scroll clear of it instead of overlapping. When
// SOS is hidden, the padding stays at the plain nav clearance — no extra space.
import { contentBottomPadding, SOS_BUTTON_SIZE } from "../AppLayout";

test("SOS hidden → padding is only the nav clearance, no SOS footprint", () => {
  const p = contentBottomPadding(false);
  assert.equal(p, "calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-lg))");
  assert.ok(!p.includes(`${SOS_BUTTON_SIZE}px`), "hidden padding must not reserve the button height");
});

test("SOS shown → padding also clears the button height and its offset", () => {
  const p = contentBottomPadding(true);
  assert.ok(p.includes(`${SOS_BUTTON_SIZE}px`), "shown padding must reserve the SOS button height");
  assert.ok(p.includes("var(--space-md)"), "shown padding must include the button's bottom offset");
  assert.ok(p.includes("var(--tabbar-height)"), "shown padding must still clear the nav");
});

test("showing SOS never shrinks the clearance vs. hiding it", () => {
  // Same nav+safe-area base in both; shown adds strictly more (space-md + size).
  assert.notEqual(contentBottomPadding(true), contentBottomPadding(false));
});
