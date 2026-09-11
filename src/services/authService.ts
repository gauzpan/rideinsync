// Thin wrapper around Supabase auth (browser/session APIs) — per decision D18,
// components never call supabase.auth.* directly. Swap-point for a future
// Capacitor auth plugin without touching call sites.
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type AuthChangeHandler = (session: Session | null) => void;

/** Starts (or continues) a Google OAuth sign-in. Redirects the browser away
 *  and back — the caller does not get a return value on this leg. */
export async function signInWithGoogle(redirectTo: string = window.location.href) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

/** Anonymous (guest) sign-in — resolves immediately with the new session. */
export async function signInAsGuest() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function getUser(session: Session | null): User | null {
  return session?.user ?? null;
}

/** Subscribes to session changes (sign-in, sign-out, token refresh). Returns
 *  an unsubscribe function. */
export function onAuthStateChange(handler: AuthChangeHandler): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
  return () => subscription.unsubscribe();
}
