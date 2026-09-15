import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readPosition,
  sendSos,
  shouldSkipLocationRead,
  skipPendingLocationRead,
  withTimeout,
} from "./sos";
// ./supabase is aliased to scripts/test/supabaseMock.ts by the unit-test
// bundler. We augment it per-test with from/rpc/functions to drive sendSos.
import { supabase } from "./supabase";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// --- navigator install/restore (node has no DOM navigator on <21) ------------
type FakeNav = { geolocation?: unknown; permissions?: unknown };
function installNavigator(nav: FakeNav | undefined): () => void {
  const g = globalThis as { navigator?: unknown };
  const had = "navigator" in g;
  const prev = g.navigator;
  Object.defineProperty(g, "navigator", { value: nav, configurable: true, writable: true });
  return () => {
    if (had) Object.defineProperty(g, "navigator", { value: prev, configurable: true, writable: true });
    else delete g.navigator;
  };
}

// ============================================================================
// withTimeout — pure race helper
// ============================================================================
test("withTimeout resolves the value when the promise settles first", async () => {
  const v = await withTimeout(Promise.resolve(42), 50);
  assert.equal(v, 42);
});

test("withTimeout resolves null when the timeout wins (slow promise)", async () => {
  const slow = new Promise<number>((r) => setTimeout(() => r(7), 100));
  const v = await withTimeout(slow, 10);
  assert.equal(v, null, "timeout fires before the slow promise");
});

test("withTimeout resolves null when the promise rejects (never throws)", async () => {
  const v = await withTimeout(Promise.reject(new Error("boom")), 50);
  assert.equal(v, null);
});

// ============================================================================
// shouldSkipLocationRead — pure decision
// ============================================================================
test("shouldSkipLocationRead skips only when permission is denied", () => {
  assert.equal(shouldSkipLocationRead("granted"), false);
  assert.equal(shouldSkipLocationRead("prompt"), false);
  assert.equal(shouldSkipLocationRead("denied"), true);
  assert.equal(shouldSkipLocationRead(undefined), false);
});

// ============================================================================
// readPosition — null on error / timeout / no support; maps coords on success
// ============================================================================
test("readPosition resolves null when geolocation is unsupported", async () => {
  const restore = installNavigator({}); // navigator with no geolocation
  try {
    assert.equal(await readPosition(), null);
  } finally {
    restore();
  }
});

test("readPosition resolves null on a generic getCurrentPosition error", async () => {
  const restore = installNavigator({
    geolocation: {
      getCurrentPosition: (_ok: unknown, err: (e: { message: string; code: number }) => void) =>
        err({ message: "denied", code: 1 }),
    },
  });
  try {
    assert.equal(await readPosition(), null);
  } finally {
    restore();
  }
});

test("readPosition resolves null on a TIMEOUT error (code 3)", async () => {
  const restore = installNavigator({
    geolocation: {
      getCurrentPosition: (_ok: unknown, err: (e: { message: string; code: number }) => void) =>
        err({ message: "timeout", code: 3 }),
    },
  });
  try {
    assert.equal(await readPosition(), null);
  } finally {
    restore();
  }
});

test("readPosition maps coords on success (proves it is not always null)", async () => {
  const restore = installNavigator({
    geolocation: {
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 12.9, longitude: 77.6, accuracy: 5, heading: null, speed: null } }),
    },
  });
  try {
    assert.deepEqual(await readPosition(), {
      lat: 12.9,
      lng: 77.6,
      accuracy: 5,
      heading: null,
      speed: null,
    });
  } finally {
    restore();
  }
});

// ============================================================================
// sendSos — GPS off must still raise the alert (hasLocation:false, alertId set)
// ============================================================================

// Wire the mock supabase for a send: no pre-existing open alert, RPC returns an
// alert id, functions.invoke (push + email) resolves harmlessly. Returns restore.
function installSupabaseForSend(rpc: () => Promise<unknown>): () => void {
  const s = supabase as { from?: unknown; rpc?: unknown; functions?: unknown };
  const orig = { from: s.from, rpc: s.rpc, functions: s.functions };
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  });
  s.from = () => chain;
  s.rpc = rpc;
  s.functions = { invoke: () => Promise.resolve({ data: null, error: null }) };
  return () => {
    s.from = orig.from;
    s.rpc = orig.rpc;
    s.functions = orig.functions;
  };
}

test('"Send now without location" yields hasLocation:false and still returns an alertId', async () => {
  // Permission "prompt" (not denied) so the read is attempted; getCurrentPosition
  // never calls back, so only skipPendingLocationRead() unblocks the send.
  const restoreNav = installNavigator({
    geolocation: { getCurrentPosition: () => {} },
    permissions: { query: () => Promise.resolve({ state: "prompt" }) },
  });
  const restoreDb = installSupabaseForSend(() =>
    Promise.resolve({ data: "alert-sendnow", error: null }),
  );
  try {
    const p = sendSos("ride-A", "user-A");
    await tick(30); // let sendSosInner reach the location race
    skipPendingLocationRead(); // rider taps "Send now without location"
    const res = await p;
    assert.equal(res.alertId, "alert-sendnow");
    assert.equal(res.hasLocation, false, "alert goes out with no location");
  } finally {
    restoreDb();
    restoreNav();
  }
});

test("permission denied → send skips the read entirely and raises the alert", async () => {
  let readCalled = false;
  const restoreNav = installNavigator({
    geolocation: {
      getCurrentPosition: () => {
        readCalled = true; // must NOT be reached when denied
      },
    },
    permissions: { query: () => Promise.resolve({ state: "denied" }) },
  });
  const restoreDb = installSupabaseForSend(() =>
    Promise.resolve({ data: "alert-denied", error: null }),
  );
  try {
    const res = await sendSos("ride-B", "user-B");
    assert.equal(res.alertId, "alert-denied");
    assert.equal(res.hasLocation, false);
    assert.equal(readCalled, false, "getCurrentPosition is never called when denied");
    await tick(15); // let fire-and-forget push/email settle
  } finally {
    restoreDb();
    restoreNav();
  }
});
