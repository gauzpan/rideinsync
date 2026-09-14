import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/models";
import {
  getValidSession,
  onAuthStateChange,
  signInAsGuest,
  signInWithGoogle,
  signOut as signOutService,
  startAutoRefresh,
  stopAutoRefresh,
} from "../services/authService";


type AuthState = {
  /** True until the initial session check resolves. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** The `profiles` row for the signed-in user (created by `handle_new_user()`). */
  profile: Profile | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  /** Local-dev only: fake session so you can explore screens without a backend. */
  signInDev: () => void;
  signOut: () => Promise<void>;
  /** Re-fetches the `profiles` row for the signed-in user — call after an
   *  edit elsewhere (e.g. RichProfilePage) so `profile` reflects the change. */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Dev-only dummy auth (only ever active under `import.meta.env.DEV`, i.e.
// `npm run dev` — never in a production build). Lets local development reach
// the post-login screens without a real Supabase session.
//
// The id is a syntactically valid (but nonexistent) UUID, not a plain string
// like "dev-user" — every `user_id`-keyed query in the app is UUID-typed, so
// a non-UUID id 400s (invalid input syntax) instead of just returning an
// empty result the way a real, ride-less user correctly would.
const DEV_AUTH_KEY = "rideinsync:devAuth";
const DEV_USER = { id: "00000000-0000-0000-0000-0000000000d3", is_anonymous: true } as unknown as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [devAuthed, setDevAuthed] = useState<boolean>(() => {
    if (!import.meta.env.DEV) return false;
    try {
      return localStorage.getItem(DEV_AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  // Guards against a slower in-flight profile fetch overwriting a newer one.
  const fetchToken = useRef(0);

  useEffect(() => {
    let cancelled = false;

    // getValidSession (not raw getSession): a stored JWT for a user that no
    // longer exists must boot to signed-out, never to a fake session that
    // fails later with RLS/FK errors.
    getValidSession()
      .then((s) => !cancelled && setSession(s))
      .finally(() => !cancelled && setLoading(false));

    const unsubscribe = onAuthStateChange((s) => setSession(s));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Revive token auto-refresh on foreground. A backgrounded native WebView (or
  // a hidden browser tab) suspends supabase-js's refresh timer, so the stored
  // access token can be expired by the time the user reopens the app — the
  // first query then fails with PGRST303 and the ride "won't load". Restarting
  // on resume forces an immediate refresh before any query fires.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const removers: Array<() => void> = [];
      let disposed = false;
      void import("@capacitor/app").then(({ App }) => {
        if (disposed) return;
        void App.addListener("resume", () => startAutoRefresh()).then((h) =>
          removers.push(() => void h.remove())
        );
        void App.addListener("pause", () => stopAutoRefresh()).then((h) =>
          removers.push(() => void h.remove())
        );
      });
      return () => {
        disposed = true;
        removers.forEach((r) => r());
      };
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") startAutoRefresh();
      else stopAutoRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);


  // The `handle_new_user()` trigger provisions the row at sign-up time; a
  // couple of retries absorb the brief window right after first sign-in.
  const fetchProfile = useCallback(async (userId: string, retry = true) => {
    const token = ++fetchToken.current;
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt++) {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (fetchToken.current !== token) return;
      if (data) {
        setProfile(data);
        return;
      }
      if (retry) await new Promise((r) => setTimeout(r, 400));
    }
  }, []);

  const activeUserId = session?.user?.id ?? (devAuthed ? DEV_USER.id : undefined);

  useEffect(() => {
    if (!activeUserId) {
      setProfile(null);
      return;
    }
    void fetchProfile(activeUserId);
  }, [activeUserId, fetchProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? (devAuthed ? DEV_USER : null),
      profile,
      isAuthenticated: !!session || devAuthed,
      isGuest: !!session?.user?.is_anonymous || devAuthed,
      signInWithGoogle,
      signInAsGuest: async () => {
        await signInAsGuest();
      },
      signInDev: () => {
        if (!import.meta.env.DEV) return;
        try {
          localStorage.setItem(DEV_AUTH_KEY, "1");
        } catch {
          // ignore
        }
        setDevAuthed(true);
      },
      signOut: async () => {
        try {
          localStorage.removeItem(DEV_AUTH_KEY);
        } catch {
          // ignore
        }
        setDevAuthed(false);
        if (session) await signOutService();
      },
      refreshProfile: async () => {
        if (!activeUserId) return;
        // A refresh after a known write shouldn't need the sign-up-race
        // retries — fetch once so the caller's `await` resolves promptly.
        await fetchProfile(activeUserId, false);
      },
    }),
    [loading, session, profile, devAuthed, activeUserId, fetchProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
