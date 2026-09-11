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
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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
      user: session?.user ?? null,
      profile,
      isAuthenticated: !!session,
      isGuest: !!session?.user?.is_anonymous,
      signInWithGoogle,
      signInAsGuest: async () => {
        await signInAsGuest();
      },
      signOut: signOutService,
    }),
    [loading, session, profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
