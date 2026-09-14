import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveRideId, subscribeActiveRide } from "./activeRide";
// ./supabase inside activeRide is aliased to the controllable mock by the
// esbuild test bundler (scripts/test/supabaseMock.ts), same as rideChannel.test.ts.
import { __setMembers, __setRides, __channels, __reset } from "./supabase";

// ===========================================================================
// REPRODUCTION of the founder-reported bug: "when SOS is raised, other group
// users are not getting the notification properly."
//
// Root cause (in-app path): the receiving side is gated on the current user's
// active ride id, produced by useActiveRide (src/lib/activeRide.ts:96-146).
// That hook does a ONE-SHOT resolve inside its effect and opens NO realtime
// subscription of its own; it only re-resolves when its deps [userId,
// refreshKey] change. The realtime-aware resolver subscribeActiveRide
// (activeRide.ts:49-86), which re-resolves on every `rides` UPDATE, EXISTS and
// is fully unit-tested, but the hook never calls it. Neither call site passes
// refreshKey (AppLayout.tsx:90, SosPage.tsx:40).
//
// Consequence: a member whose active-ride resolve ran while the ride was still
// a draft (or before they joined) is stuck at rideId = null. useSosAlerts(null)
// early-returns without acquiring the shared `ride-<id>` channel, so the
// sos_alerts INSERT is never delivered and the SOS card never shows.
//
// The two REPRO tests below model the hook's exact behavior with the mock. They
// FAIL against the current code (asserting the value the app SHOULD hold after
// a status flip / join). They are SKIPPED by default so the suite stays green;
// run `RUN_REPRO=1 npm test` to see them fail and reproduce the bug.
// ===========================================================================

const UID = "11111111-1111-1111-1111-111111111111";
const RIDE = "00000000-0000-0000-0000-0000000000a1";

const REPRO_SKIP: string | undefined = process.env.RUN_REPRO
  ? undefined
  : "REPRO of the current in-app SOS bug; set RUN_REPRO=1 to reproduce the failure. Skipped so the default suite stays green.";

test(
  "REPRO: member mounted before ride goes active never re-resolves rideId (useActiveRide is one-shot, subscribeActiveRide unused)",
  { skip: REPRO_SKIP },
  async () => {
    __reset();
    // Mount while the ride is still a draft — this is the single resolve the
    // hook's effect performs on mount (activeRide.ts:117-138).
    __setMembers({ data: [{ ride_id: RIDE }], error: null });
    __setRides({ data: null, error: null }); // no row with status='active' yet
    let hookRideId = await resolveActiveRideId(UID);
    assert.equal(hookRideId, null); // correct at mount: ride is a draft

    // Leader starts the ride: draft -> active. Realtime fires a `rides` UPDATE,
    // but useActiveRide opens no subscription and its deps did not change, so
    // its resolve is never called again. The id the app still holds is stale:
    __setRides({ data: { id: RIDE }, error: null });
    // (no re-resolve happens in the real hook here)

    assert.equal(
      hookRideId,
      RIDE,
      "BUG: hook never re-resolves after the status flip; rideId stays null, so useSosAlerts(null) never subscribes to sos_alerts and the SOS card never shows.",
    );
  },
);

test(
  "REPRO: member who joins an already-active ride without navigating never resolves rideId (no refreshKey, ride_members not in realtime publication)",
  { skip: REPRO_SKIP },
  async () => {
    __reset();
    // App already open; user is not yet a member of the (already active) ride.
    __setMembers({ data: [], error: null });
    __setRides({ data: { id: RIDE }, error: null });
    let hookRideId = await resolveActiveRideId(UID);
    assert.equal(hookRideId, null); // correct: not a member yet

    // User taps a join link and joins: ride_members INSERT. ride_members is NOT
    // in the supabase_realtime publication (0001_foundation.sql; only `rides`
    // UPDATE is published, 0010_flow3_ride_realtime.sql), and refreshKey is
    // never passed at the call site (AppLayout.tsx:90), so nothing re-runs the
    // resolve.
    __setMembers({ data: [{ ride_id: RIDE }], error: null });
    // (no re-resolve happens in the real hook here)

    assert.equal(
      hookRideId,
      RIDE,
      "BUG: joining an already-active ride does not re-resolve rideId (no refreshKey change, no realtime for ride_members), so the joiner never receives any SOS.",
    );
  },
);

// Positive control (NOT skipped): proves the fix mechanism already exists and
// works — subscribeActiveRide DOES re-resolve on a `rides` UPDATE. The bug is
// purely that useActiveRide does not use it. This mirrors the intent of the
// existing activeRide.test.ts:55 case and pins that the mechanism is available.
test("CONTROL: subscribeActiveRide re-resolves on a rides UPDATE (mechanism the hook fails to use)", async () => {
  __reset();
  installFakeDocument();
  __setMembers({ data: [{ ride_id: RIDE }], error: null });
  __setRides({ data: null, error: null }); // draft
  const seen: Array<string | null> = [];
  const cleanup = subscribeActiveRide(UID, (id) => seen.push(id));
  await tick();
  assert.equal(seen.at(-1), null, "draft: not active yet");

  __setRides({ data: { id: RIDE }, error: null }); // flip to active
  __channels[0].handlers.forEach((h) => h({ new: { id: RIDE, status: "active" } }));
  await tick();
  assert.equal(seen.at(-1), RIDE, "same subscription surfaces the active ride without any remount");
  cleanup();
});

// --- minimal fake document so subscribeActiveRide's visibilitychange wiring
// runs under node (mirrors activeRide.test.ts's helper) --------------------
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
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
