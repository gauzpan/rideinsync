// M3 Task 3 — shared per-ride Realtime channel registry.
//
// Before this, useRideChannel (rider_positions/ride_members/ride_events/rides),
// useSosAlerts (sos.ts), useNavigateOnRideEnd, and useRideSignalListener
// (signals.ts) each opened their *own* `supabase.channel(...)` for the same
// ride, giving one client 3-4 concurrent Realtime channel subscriptions per
// ride screen (see docs/scale-readiness-roadmap.md M3.3). At 1000 concurrent
// riders that's 3000-4000 channels project-wide — the actual scale ceiling,
// not any one ride's data volume.
//
// This module multiplexes all of them onto a single channel object per
// rideId (`ride-<rideId>`, the name useRideChannel already used), reference
// counted across every hook instance that wants it, from whatever component
// mounts it and whenever it does.
//
// Why a registry instead of "make useRideChannel own it and pass it down":
// SOS/signals/ride-end hooks are called from components that don't share a
// parent with (or mount before/after) whatever mounts useRideChannel —
// AppLayout mounts useSosAlerts/useRideSignalListener at the app shell level,
// RiderViewPage/LeadViewPage mount useNavigateOnRideEnd, and LiveOps (a child
// of both) mounts useRideChannel and *also* useSosAlerts again. Passing a
// channel down via props/context would require a shared ancestor and
// mount-order guarantees that don't hold here; a rideId-keyed module-level
// registry does not.
//
// Realtime constraint this design has to respect: postgres_changes bindings
// must be registered via `.on(...)` *before* `.subscribe()` is called — the
// binding list is sent once, as part of the join payload. Broadcast bindings
// don't have this restriction (event-name filtering happens client-side on
// every inbound message), but for consistency every fixed binding below is
// still wired up at channel-creation time. Because hook instances attach and
// detach at arbitrary times, none of them call `.on()`/`.subscribe()`
// directly — they instead register a plain callback into an in-memory
// listener set that this module dispatches to from the one binding it did
// register up front. That's what lets any number of hook instances join and
// leave the same underlying channel after it's already subscribed.

import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PgChangePayload<T = Record<string, unknown>> = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T>;
};

type Listener<T = unknown> = (payload: T) => void;

type Listeners = {
  rideMembers: Set<Listener<PgChangePayload>>;
  rideEvents: Set<Listener<PgChangePayload>>;
  rides: Set<Listener<PgChangePayload>>;
  sosAlerts: Set<Listener<PgChangePayload>>;
  pack: Set<Listener<{ payload: unknown }>>;
};

type Entry = {
  channel: RealtimeChannel;
  refCount: number;
  listeners: Listeners;
};

const registry = new Map<string, Entry>();

function createEntry(rideId: string): Entry {
  const listeners: Listeners = {
    rideMembers: new Set(),
    rideEvents: new Set(),
    rides: new Set(),
    sosAlerts: new Set(),
    pack: new Set(),
  };

  const dispatch =
    <T,>(set: Set<Listener<T>>) =>
    (payload: T) => {
      for (const fn of set) fn(payload);
    };

  const channel = supabase
    .channel(`ride-${rideId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ride_members", filter: `ride_id=eq.${rideId}` },
      dispatch(listeners.rideMembers),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "ride_events", filter: `ride_id=eq.${rideId}` },
      dispatch(listeners.rideEvents),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
      dispatch(listeners.rides),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sos_alerts", filter: `ride_id=eq.${rideId}` },
      dispatch(listeners.sosAlerts),
    )
    .on("broadcast", { event: "pack" }, dispatch(listeners.pack))
    .subscribe();

  return { channel, refCount: 0, listeners };
}

export type RideChannelHandle = {
  channel: RealtimeChannel;
  listeners: Listeners;
  /** Must be called exactly once, from the acquiring effect's cleanup. */
  release: () => void;
};

/**
 * Get (creating if needed) the shared channel for `rideId`, incrementing its
 * refcount. Every caller MUST call the returned `release()` exactly once
 * (e.g. from a `useEffect` cleanup) — the underlying channel is torn down via
 * `supabase.removeChannel` only once the last consumer releases it.
 */
export function acquireRideChannel(rideId: string): RideChannelHandle {
  let entry = registry.get(rideId);
  if (!entry) {
    entry = createEntry(rideId);
    registry.set(rideId, entry);
  }
  entry.refCount += 1;
  const boundEntry = entry;

  let released = false;
  return {
    channel: boundEntry.channel,
    listeners: boundEntry.listeners,
    release: () => {
      if (released) return; // idempotent — a double-release (e.g. StrictMode) is a no-op
      released = true;
      const current = registry.get(rideId);
      if (!current || current !== boundEntry) return; // already torn down / replaced
      current.refCount -= 1;
      if (current.refCount <= 0) {
        registry.delete(rideId);
        void supabase.removeChannel(current.channel);
      }
    },
  };
}

/** Test/debug only: current refcount for a rideId, or 0 if not open. */
export function _debugRefCount(rideId: string): number {
  return registry.get(rideId)?.refCount ?? 0;
}
