import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireRideChannel, _debugRefCount, type PgChangePayload } from "./rideChannel";
// ./supabase inside rideChannel is aliased to the controllable mock by the
// esbuild test bundler (scripts/test/supabaseMock.ts).
import { __channels, __reset } from "./supabase";

const RIDE = "00000000-0000-0000-0000-0000000000a1";

// The bindings createEntry() registers, in .on() call order. The mock records
// each callback into channel.handlers in this same order, so the index below
// is the contract this test pins: if a binding is added/removed/reordered
// upstream, the sos dispatch index shifts and this guard catches it.
const SOS_ALERTS_HANDLER_INDEX = 3; // [rideMembers, rideEvents, rides, sosAlerts, pack]

// Regression guard for the M3 realtime consolidation (src/lib/rideChannel.ts):
// the in-app SOS card path (useSosAlerts) no longer opens its own channel — it
// attaches a listener to the shared `ride-<id>` channel's `sosAlerts` set and
// relies on this module to (a) register a sos_alerts postgres_changes binding
// up front and (b) dispatch every INSERT/UPDATE to those listeners. If either
// breaks, other members silently stop receiving SOS alerts in-app.

test("acquireRideChannel opens one subscribed `ride-<id>` channel", () => {
  __reset();
  const handle = acquireRideChannel(RIDE);
  assert.equal(__channels.length, 1);
  assert.equal(__channels[0].name, `ride-${RIDE}`);
  assert.equal(__channels[0].subscribed, true);
  handle.release();
});

test("sos_alerts INSERT/UPDATE is dispatched to every registered sosAlerts listener", () => {
  __reset();
  const handle = acquireRideChannel(RIDE);

  const received: PgChangePayload[] = [];
  const listener = (p: PgChangePayload) => received.push(p);
  handle.listeners.sosAlerts.add(listener);

  // The binding the shared channel registered for the sos_alerts table.
  const dispatch = __channels[0].handlers[SOS_ALERTS_HANDLER_INDEX] as (p: unknown) => void;
  assert.equal(typeof dispatch, "function", "sos_alerts binding must be registered before subscribe");

  const insert = { eventType: "INSERT", new: { id: "alert-1", ride_id: RIDE }, old: {} };
  const update = { eventType: "UPDATE", new: { id: "alert-1", ride_id: RIDE, resolved_at: "t" }, old: {} };
  dispatch(insert);
  dispatch(update);

  assert.deepEqual(received, [insert, update]);

  // A removed listener stops receiving (mirrors useSosAlerts' effect cleanup).
  handle.listeners.sosAlerts.delete(listener);
  dispatch(insert);
  assert.equal(received.length, 2);

  handle.release();
});

test("channel is reference counted and torn down only on last release", () => {
  __reset();
  const a = acquireRideChannel(RIDE);
  const b = acquireRideChannel(RIDE);
  // Both consumers share the same underlying channel object.
  assert.equal(__channels.length, 1);
  assert.equal(_debugRefCount(RIDE), 2);

  a.release();
  assert.equal(_debugRefCount(RIDE), 1);
  assert.equal(__channels[0].removed, false, "channel must survive while a consumer remains");

  b.release();
  assert.equal(_debugRefCount(RIDE), 0);
  assert.equal(__channels[0].removed, true, "channel must be removed once the last consumer releases");

  // Double-release is a no-op (StrictMode double-invokes effect cleanups).
  b.release();
  assert.equal(_debugRefCount(RIDE), 0);
});
