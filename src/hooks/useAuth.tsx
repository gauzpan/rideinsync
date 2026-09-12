import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/models";
import {
  getSession,
  onAuthStateChange,
  signInAsGuest,
  signInWithGoogle,
  signOut as signOutService,
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

    getSession()
      .then((s) => !cancelled && setSession(s))
      .finally(() => !cancelled && setLoading(false));

    const unsubscribe = onAuthStateChange((s) => setSession(s));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }
    const token = ++fetchToken.current;
    // The `handle_new_user()` trigger provisions this row at sign-up time; a
    // couple of retries absorb the brief window right after first sign-in.
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        if (fetchToken.current !== token) return;
        if (data) {
          setProfile(data);
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
  }, [session?.user?.id]);

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
    }),
    [loading, session, profile, devAuthed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
