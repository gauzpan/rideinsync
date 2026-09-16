import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveRideId, subscribeActiveRide, RERESOLVE_DEBOUNCE_MS } from "./activeRide";
// The ./supabase import inside activeRide is aliased to a controllable mock by
// the esbuild test bundler (scratchpad/run-activeRide-test.mjs).
import {
  __setMembers,
  __setRides,
  __channels,
  __reset,
} from "./supabase";

const UID = "11111111-1111-1111-1111-111111111111";
const RIDE = "00000000-0000-0000-0000-0000000000a1";

// A minimal fake document so subscribeActiveRide's visibilitychange wiring runs.
function installFakeDocument() {
  const listeners: Record<string, Array<() => void>> = {};
  (globalThis as any).document = {
    visibilityState: "visible",
    addEventListener: (evt: string, cb: () => void) => {
      (listeners[evt] ??= []).push(cb);
    },
    removeEventListener: (evt: string, cb: () => void) => {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== cb);
    },
    __fire: (evt: string) => (listeners[evt] ?? []).forEach((f) => f()),
    __count: (evt: string) => (listeners[evt] ?? []).length,
  };
  return (globalThis as any).document;
}

// A minimal fake window so subscribeActiveRide's `focus` wiring runs.
function installFakeWindow() {
  const listeners: Record<string, Array<() => void>> = {};
  (globalThis as any).window = {
    addEventListener: (evt: string, cb: () => void) => {
      (listeners[evt] ??= []).push(cb);
    },
    removeEventListener: (evt: string, cb: () => void) => {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== cb);
    },
    __fire: (evt: string) => (listeners[evt] ?? []).forEach((f) => f()),
    __count: (evt: string) => (listeners[evt] ?? []).length,
  };
  return (globalThis as any).window;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
// Wait comfortably past the foreground-return debounce so a scheduled
// re-resolve has fired.
const pastDebounce = () => new Promise((r) => setTimeout(r, RERESOLVE_DEBOUNCE_MS + 30));

test("resolveActiveRideId returns the active ride id", async () => {
  __reset();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: { id: RIDE }, error: null });
  assert.equal(await resolveActiveRideId(UID), RIDE);
});

test("resolveActiveRideId returns null when the user's ride is not active", async () => {
  __reset();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null }); // no row with status=active
  assert.equal(await resolveActiveRideId(UID), null);
});

test("resolveActiveRideId returns null when the user is in no rides", async () => {
  __reset();
  __setMembers({ data: [], error: null });
  assert.equal(await resolveActiveRideId(UID), null);
});

test("subscription surfaces the new active ride after status flips (no remount)", async () => {
  __reset();
  installFakeDocument();
  // Start as a draft ride: membership exists, but no active ride yet.
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null });

  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick(); // initial resolve
  assert.equal(seen.at(-1), null, "initial: not active yet");

  const ch = __channels[0];
  assert.ok(ch && ch.subscribed, "a realtime channel was opened and subscribed");
  assert.ok(ch.handlers.length >= 1, "an UPDATE handler was registered");

  // Backend flips draft -> active; realtime fires an UPDATE on rides.
  __setRides({ data: { id: RIDE }, error: null });
  ch.handlers.forEach((h) => h({ new: { id: RIDE, status: "active" } }));
  await tick();
  assert.equal(seen.at(-1), RIDE, "same subscription now yields the active ride id");

  // (a) ride ended -> active ride goes back to null on the next event.
  __setRides({ data: null, error: null });
  ch.handlers.forEach((h) => h({ new: { id: RIDE, status: "ended" } }));
  await tick();
  assert.equal(seen.at(-1), null, "ended ride resolves back to null");

  cleanup();
});

test("visibilitychange -> visible re-resolves (debounced)", async () => {
  __reset();
  const doc = installFakeDocument();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null });
  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.at(-1), null);
  __setRides({ data: { id: RIDE }, error: null });
  (doc as any).__fire("visibilitychange");
  await pastDebounce();
  assert.equal(seen.at(-1), RIDE, "coming back to foreground refetches");
  cleanup();
});

test("window focus re-resolves (debounced)", async () => {
  __reset();
  installFakeDocument();
  const win = installFakeWindow();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null });
  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.at(-1), null);
  __setRides({ data: { id: RIDE }, error: null });
  (win as any).__fire("focus");
  await pastDebounce();
  assert.equal(seen.at(-1), RIDE, "window focus (rider returns to app) refetches");
  cleanup();
});

test("a visibility+focus burst coalesces into a single re-resolve", async () => {
  __reset();
  const doc = installFakeDocument();
  const win = installFakeWindow();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: { id: RIDE }, error: null });
  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.length, 1, "initial resolve only");

  // One foreground return typically fires both events back-to-back.
  (doc as any).__fire("visibilitychange");
  (win as any).__fire("focus");
  (doc as any).__fire("visibilitychange");
  await pastDebounce();
  assert.equal(seen.length, 2, "the burst yields exactly one extra resolve, not three");
  cleanup();
});

test("focus listener is removed on cleanup (no leak)", async () => {
  __reset();
  installFakeDocument();
  const win = installFakeWindow();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null });
  const cleanup = subscribeActiveRide(UID, () => {});
  await tick();
  assert.equal((win as any).__count("focus"), 1);
  cleanup();
  assert.equal((win as any).__count("focus"), 0, "focus listener removed");
});

test("cleanup removes the channel and the visibility listener (no leak)", async () => {
  __reset();
  const doc = installFakeDocument();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null });
  const cleanup = subscribeActiveRide(UID, () => {});
  await tick();
  const ch = __channels[0];
  assert.equal((doc as any).__count("visibilitychange"), 1);
  cleanup();
  assert.equal(ch.removed, true, "channel removed on cleanup");
  assert.equal((doc as any).__count("visibilitychange"), 0, "visibility listener removed");
});

test("late resolve after cleanup does not call back (userId switch / unmount)", async () => {
  __reset();
  installFakeDocument();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: { id: RIDE }, error: null });
  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  cleanup(); // unmount immediately, before the in-flight resolve settles
  await tick();
  assert.equal(seen.length, 0, "no callback fires after cleanup");
});

test("refreshKey change re-runs resolve + resubscribe (join to already-active ride)", async () => {
  // Models what the hook does when `refreshKey` (route pathname) changes:
  // cleanup() the old subscription, then subscribeActiveRide() again. This is
  // the path that catches a ride_members join, which realtime can't see
  // (ride_members is not in the supabase_realtime publication).
  __reset();
  installFakeDocument();
  __setMembers({ data: [], error: null }); // not a member yet -> no ride
  __setRides({ data: { id: RIDE }, error: null }); // ride is already active

  const seen: Array<string | null> = [];
  let cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.at(-1), null, "before joining: no active ride");
  assert.equal(__channels.length, 1);

  // Rider joins the already-active ride (ride_members INSERT — no rides UPDATE).
  __setMembers({ data: [{ ride_id: RIDE }], error: null });

  // refreshKey changes -> effect re-runs: cleanup old, resubscribe.
  cleanup();
  assert.equal(__channels[0].removed, true, "old channel torn down");
  cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.at(-1), RIDE, "re-resolve picks up the newly joined active ride");
  assert.equal(__channels.length, 2, "a fresh channel was opened");
  assert.equal(__channels[1].subscribed, true);

  cleanup();
});
