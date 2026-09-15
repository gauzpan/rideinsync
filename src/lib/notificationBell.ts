// Global notification-bell store. Same module-level pub/sub shape as
// voiceActivity.ts: AppLayout (which already resolves the active ride and owns
// the SOS-alert + ride-signal subscriptions) publishes into it, and the bell in
// AccountBar — which mounts on every signed-in screen — subscribes so a rider
// off the ride view still gets a persistent "a signal arrived" indicator once
// the transient toast is gone.
//
// Only OTHER riders' events are ever published here: AppLayout's SOS path uses
// useSosAlerts (which filters the viewer's own alert out) and its ride-signal
// path uses useRideSignalListener (which skips the sender), so the store itself
// does no self-filtering.
import { useEffect, useState } from "react";
import type { SignalKind } from "./signals";

export type BellEvent = { id: string; kind: SignalKind; at: number };

export type BellState = {
  /** Events not yet acknowledged by tapping the bell. Drives its colour + dot. */
  unseen: BellEvent[];
  /** Most recent event (drives the popover); retained after markBellSeen. */
  latest: BellEvent | null;
  /** Active ride id, so the bell can deep-link to /ride/:id (published by AppLayout). */
  rideId: string | null;
};

let state: BellState = { unseen: [], latest: null, rideId: null };
// Every id ever published, so a re-fetch that replays an alert/signal can't
// relight the bell (dedupe by id, §6). Ids persist across markBellSeen — once
// acknowledged, the same event must stay acknowledged.
const publishedIds = new Set<string>();
const subs = new Set<(s: BellState) => void>();

function emit(): void {
  subs.forEach((notify) => notify(state));
}

/** AppLayout → store, on each incoming SOS alert / ride signal from another rider. */
export function publishBellEvent(e: BellEvent): void {
  try {
    if (publishedIds.has(e.id)) return; // dedupe: a re-fetch must not relight
    publishedIds.add(e.id);
    state = { ...state, unseen: [...state.unseen, e], latest: e };
    console.info(`[bell] event ${e.kind} ${e.id}`);
    emit();
  } catch (err) {
    // The store must never throw on publish (e.g. before any subscriber has
    // mounted). Swallow and log — a failed indicator must not break the app.
    console.warn("[bell] publish failed", err);
  }
}

/** AppLayout → store, whenever the active ride id changes. */
export function publishBellRide(rideId: string | null): void {
  if (state.rideId === rideId) return;
  // Ride ended (id → null): clear unacknowledged events too — they belong to a
  // ride that's over (§6).
  const unseen = rideId === null ? [] : state.unseen;
  state = { ...state, rideId, unseen };
  emit();
}

/** Bell tap → acknowledge every unseen event (colour resets to none). */
export function markBellSeen(): void {
  if (state.unseen.length === 0) return;
  state = { ...state, unseen: [] };
  console.info("[bell] seen");
  emit();
}

/** Subscribe a component to the live bell state. */
export function useBellState(): BellState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    setSnapshot(state); // resync in case an event landed between render and effect
    subs.add(setSnapshot);
    return () => {
      subs.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

/** Highest-urgency colour bucket across the unseen events (pure, unit-tested). */
export function bellColorFor(unseen: { kind: SignalKind }[]): "danger" | "warn" | "ok" | "none" {
  if (unseen.some((e) => e.kind === "sos")) return "danger";
  if (unseen.some((e) => e.kind === "hazard")) return "warn";
  if (unseen.some((e) => e.kind === "regroup" || e.kind === "pitstop")) return "ok";
  return "none";
}

// ---- Popover state machine (pure, unit-tested) -----------------------------
export type PopoverState = { open: boolean; event: BellEvent | null };
export type PopoverAction =
  | { type: "event"; e: BellEvent }
  | { type: "dismiss" }
  | { type: "timeout" };

/** Each incoming event opens the popover and replaces its text; the component
 *  owns the 5 s timer and restarts it whenever a new "event" arrives. */
export function popoverReducer(state: PopoverState, action: PopoverAction): PopoverState {
  switch (action.type) {
    case "event":
      return { open: true, event: action.e };
    case "dismiss":
    case "timeout":
      return { open: false, event: null };
  }
}

// ---- Test-only seams (mirrors rideChannel's __reset / _debugRefCount) -------
export function _getBellState(): BellState {
  return state;
}
export function _resetBell(): void {
  state = { unseen: [], latest: null, rideId: null };
  publishedIds.clear();
  subs.clear();
}
