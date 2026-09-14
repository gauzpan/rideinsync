import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// The rider's current active ride, or null. Active = a ride_members row whose
// ride has status 'active'. Demo mode returns the seed ride (Nandi Hills run).
const DEMO = import.meta.env.VITE_DEMO_SESSION === "1";
export const DEMO_RIDE_ID = "00000000-0000-0000-0000-0000000000b1";

export type ActiveRideState = { rideId: string | null; loading: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the user's current active ride id (or null). Exported for tests.
 * Two typed queries (no embedded join) keep this clean against the
 * hand-authored Database types: rides this user is a member of, then the first
 * one that is currently active.
 */
export async function resolveActiveRideId(userId: string): Promise<string | null> {
  const { data: memberships, error: mErr } = await supabase
    .from("ride_members")
    .select("ride_id")
    .eq("user_id", userId);
  if (mErr || !memberships?.length) {
    if (mErr) console.warn("[sos] membership lookup failed", mErr.message);
    return null;
  }
  const { data: ride, error: rErr } = await supabase
    .from("rides")
    .select("id")
    .in("id", memberships.map((m) => m.ride_id))
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (rErr) console.warn("[sos] active ride lookup failed", rErr.message);
  return ride?.id ?? null;
}

/**
 * Resolve the active ride now, then keep it current by re-resolving whenever a
 * `rides` row the user can see is UPDATEd (draft→active, active→ended) and
 * whenever the tab returns to the foreground. `rides` is in the
 * `supabase_realtime` publication (migration 0008_flow3_ride_realtime.sql) and
 * RLS scopes the stream to the user's own member rides, so the unfiltered
 * subscription only receives rows this user may read. Follows the channel
 * pattern in lib/sos.ts (useSosAlerts). Returns a cleanup function.
 * Exported for tests.
 */
export function subscribeActiveRide(
  userId: string,
  onResolve: (rideId: string | null) => void,
): () => void {
  let active = true;

  const run = async () => {
    const rideId = await resolveActiveRideId(userId);
    if (!active) return;
    console.info("[sos] active ride ->", rideId);
    onResolve(rideId);
  };
  void run();

  const channel = supabase
    .channel(`active-ride:${userId}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rides" },
      () => void run(),
    )
    .subscribe();

  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") void run();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  return () => {
    active = false;
    supabase.removeChannel(channel);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/**
 * `refreshKey` — an optional value that, when it changes, forces a fresh
 * resolve + resubscribe. Joining/leaving a ride mutates `ride_members`
 * (INSERT/DELETE), and that table is NOT in the supabase_realtime publication
 * (0008 only publishes `rides`), so a rider who joins an already-active ride
 * would otherwise never be notified. Callers pass a value that changes on
 * navigation (e.g. the route pathname) so entering the app/SOS view re-resolves.
 */
export function useActiveRide(userId: string | null, refreshKey?: string): ActiveRideState {
  const [state, setState] = useState<ActiveRideState>(
    DEMO ? { rideId: DEMO_RIDE_ID, loading: false } : { rideId: null, loading: true },
  );

  useEffect(() => {
    if (DEMO) return;
    // `userId` is a real UUID for every real (including guest) session. The
    // "Continue as developer" dev-only bypass uses the literal id "dev-user",
    // which isn't one — querying with it 400s (invalid uuid syntax) instead
    // of just resolving "not in a ride", which is the actual right answer.
    if (!userId || !UUID_RE.test(userId)) {
      setState({ rideId: null, loading: false });
      return;
    }
    let active = true;
    setState((s) => ({ ...s, loading: true }));

    // Two typed queries (no embedded join) keep this clean against the
    // hand-authored Database types: rides this user is a member of, then the
    // first one that is currently active.
    (async () => {
      const { data: memberships, error: mErr } = await supabase
        .from("ride_members")
        .select("ride_id")
        .eq("user_id", userId);
      if (!active) return;
      if (mErr || !memberships?.length) {
        if (mErr) console.warn("[sos] membership lookup failed", mErr.message);
        setState({ rideId: null, loading: false });
        return;
      }
      const { data: ride, error: rErr } = await supabase
        .from("rides")
        .select("id")
        .in("id", memberships.map((m) => m.ride_id))
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (rErr) console.warn("[sos] active ride lookup failed", rErr.message);
      setState({ rideId: ride?.id ?? null, loading: false });
    })();

    return () => {
      active = false;
    };
    // `refreshKey` is intentionally a dependency: when it changes (e.g. on
    // navigation) we re-resolve, since ride_members isn't in Realtime.
  }, [userId, refreshKey]);

  return state;
}
