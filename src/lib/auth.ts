import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Minimal session hook. Flow 1 will replace this with a full useAuth().
// Public shape kept tiny on purpose: { userId, loading }.
//
// Demo mode (VITE_DEMO_SESSION=1) returns the seed rider Rohan so the SOS
// feature can be exercised without Supabase keys.
const DEMO = import.meta.env.VITE_DEMO_SESSION === "1";
const DEMO_USER_ID = "00000000-0000-0000-0000-0000000000a3";

export type SessionState = { userId: string | null; loading: boolean };

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(
    DEMO ? { userId: DEMO_USER_ID, loading: false } : { userId: null, loading: true },
  );

  useEffect(() => {
    if (DEMO) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState({ userId: data.session?.user?.id ?? null, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ userId: session?.user?.id ?? null, loading: false });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
