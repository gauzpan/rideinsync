import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// The rider's current active ride, or null. Active = a ride_members row whose
// ride has status 'active'. Demo mode returns the seed ride (Nandi Hills run).
const DEMO = import.meta.env.VITE_DEMO_SESSION === "1";
const DEMO_RIDE_ID = "00000000-0000-0000-0000-0000000000b1";

export type ActiveRideState = { rideId: string | null; loading: boolean };

export function useActiveRide(userId: string | null): ActiveRideState {
  const [state, setState] = useState<ActiveRideState>(
    DEMO ? { rideId: DEMO_RIDE_ID, loading: false } : { rideId: null, loading: true },
  );

  useEffect(() => {
    if (DEMO) return;
    if (!userId) {
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
  }, [userId]);

  return state;
}
