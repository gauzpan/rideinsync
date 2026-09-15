import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeActiveRide, RERESOLVE_DEBOUNCE_MS } from "./activeRide";
// ./supabase inside activeRide is aliased to the controllable mock by the
// esbuild test bundler (scripts/test/supabaseMock.ts), same as rideChannel.test.ts.
import { __setMembers, __setRides, __channels, __reset } from "./supabase";

// ===========================================================================
// Regression for the founder-reported bug: "when SOS is raised, other group
// users are not getting the notification properly."
//
// Root cause (in-app path): the receiving side is gated on the current user's
// active ride id, produced by useActiveRide (src/lib/activeRide.ts). Before the
// fix, that hook did a ONE-SHOT resolve inside its effect and opened NO realtime
// subscription; it only re-resolved when its deps [userId, refreshKey] changed,
// and neither call site passed refreshKey. So a member whose active-ride resolve
// ran while the ride was still a draft (or before they joined) was stuck at
// rideId = null, useSosAlerts(null) never subscribed, and the SOS card never
// showed until a full reload.
//
// The fix wires useActiveRide onto subscribeActiveRide, so the hook now
// re-resolves on every `rides` UPDATE (draft→active, active→ended) and on
// foreground return (visibilitychange/focus). These two tests drive that shared
// mechanism through the exact scenarios the founder hit; they FAILED against the
// pre-fix one-shot code and PASS now. They are no longer gated behind RUN_REPRO.
// ===========================================================================

const UID = "11111111-1111-1111-1111-111111111111";
const RIDE = "00000000-0000-0000-0000-0000000000a1";

const tick = () => new Promise((r) => setTimeout(r, 0));
const pastDebounce = () => new Promise((r) => setTimeout(r, RERESOLVE_DEBOUNCE_MS + 30));

// Minimal fake document/window so the foreground-return wiring runs under node.
function installFakeDom() {
  const docListeners: Record<string, Array<() => void>> = {};
  const winListeners: Record<string, Array<() => void>> = {};
  (globalThis as any).document = {
    visibilityState: "visible",
    addEventListener: (evt: string, cb: () => void) => void (docListeners[evt] ??= []).push(cb),
    removeEventListener: (evt: string, cb: () => void) => {
      docListeners[evt] = (docListeners[evt] ?? []).filter((f) => f !== cb);
    },
    __fire: (evt: string) => (docListeners[evt] ?? []).forEach((f) => f()),
  };
  (globalThis as any).window = {
    addEventListener: (evt: string, cb: () => void) => void (winListeners[evt] ??= []).push(cb),
    removeEventListener: (evt: string, cb: () => void) => {
      winListeners[evt] = (winListeners[evt] ?? []).filter((f) => f !== cb);
    },
    __fire: (evt: string) => (winListeners[evt] ?? []).forEach((f) => f()),
  };
}

test("member mounted before the ride goes active now re-resolves rideId on the rides UPDATE (SOS card can show)", async () => {
  __reset();
  installFakeDom();
  // Mount while the ride is still a draft — the single resolve on mount.
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null }); // no active row yet
  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.at(-1), null, "correct at mount: the ride is still a draft");

  // Leader starts the ride: draft -> active. Realtime fires a `rides` UPDATE and
  // the same subscription re-resolves — no remount, no reload.
  __setRides({ data: { id: RIDE }, error: null });
  __channels[0].handlers.forEach((h) => h({ new: { id: RIDE, status: "active" } }));
  await tick();
  assert.equal(
    seen.at(-1),
    RIDE,
    "FIXED: hook re-resolves after the status flip, so useSosAlerts subscribes and the SOS card shows.",
  );
  cleanup();
});

test("member who joins an already-active ride re-resolves rideId on foreground return (ride_members not in realtime publication)", async () => {
  __reset();
  installFakeDom();
  // App already open; user is not yet a member of the (already active) ride.
  __setMembers({ data: [], error: null });
  __setRides({ data: { id: RIDE }, error: null });
  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.at(-1), null, "correct: not a member yet");

  // User taps the join link and joins: ride_members INSERT. ride_members is NOT
  // in the supabase_realtime publication, so no realtime event fires. When they
  // return to the foreground the tab re-resolves and picks up the join.
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  (globalThis as any).document.__fire("visibilitychange");
  await pastDebounce();
  assert.equal(
    seen.at(-1),
    RIDE,
    "FIXED: foreground return re-resolves the newly joined active ride, so the joiner receives SOS.",
  );
  cleanup();
});
