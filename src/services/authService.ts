// Thin wrapper around Supabase auth (browser/session APIs) — per decision D18,
// components never call supabase.auth.* directly. Swap-point for a future
// Capacitor auth plugin without touching call sites.
import type { Session, User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "../lib/supabase";

export type AuthChangeHandler = (session: Session | null) => void;

// Deep link the native OAuth flow returns to. Must be listed in the Supabase
// project's Auth → URL Configuration → Redirect URLs, and registered as an
// intent-filter scheme in android/app/src/main/AndroidManifest.xml.
export const NATIVE_OAUTH_REDIRECT = "com.rideinsync.app://auth";

/** Starts a Google OAuth sign-in.
 *  - Native (Capacitor): opens the system browser (Google blocks OAuth in a
 *    WebView) and returns to the app via the deep link, completed by
 *    completeOAuthFromUrl().
 *  - Web: normal in-page redirect. */
export async function signInWithGoogle(redirectTo: string = window.location.href) {
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data?.url) await Browser.open({ url: data.url });
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

/** Completes native OAuth: exchanges the deep-link `?code=` for a session and
 *  closes the in-app browser. Call from the App `appUrlOpen` listener. */
export async function completeOAuthFromUrl(url: string): Promise<void> {
  let code: string | null = null;
  try {
    code = new URL(url).searchParams.get("code");
  } catch {
    return;
  }
  if (!code) return;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  void Browser.close().catch(() => {});
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

/** Foreground/background auto-refresh control. supabase-js keeps the access
 *  token fresh on a JS interval, but a backgrounded Capacitor WebView (or a
 *  hidden browser tab) suspends that interval — so after the app has been away
 *  a while the stored token is already expired, and the first authenticated
 *  query fails with PGRST303 (surfacing as a generic "couldn't load the
 *  ride"). Restarting on resume runs an immediate refresh tick that renews an
 *  expired token before any query runs, then revives the interval. Both calls
 *  are safe to invoke repeatedly. */
export function startAutoRefresh(): void {
  void supabase.auth.startAutoRefresh();
}

export function stopAutoRefresh(): void {
  void supabase.auth.stopAutoRefresh();
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

const PENDING_JOIN_CODE_KEY = "rideinsync:pendingJoinCode";

/** Stashes a join code before a Google OAuth redirect so it survives the
 *  round-trip even if the provider lands the browser somewhere other than
 *  the exact `/join/:code` page (e.g. a redirect-URL allowlist that only
 *  covers the origin). Guest sign-in never navigates away, so it never needs
 *  this. Paired with `consumePendingJoinCode`. */
export function stashPendingJoinCode(code: string): void {
  try {
    sessionStorage.setItem(PENDING_JOIN_CODE_KEY, code);
  } catch {
    // sessionStorage unavailable (e.g. private-mode Safari) — the code can
    // still survive via the redirect URL itself in the common case.
  }
}

/** Reads and clears the stashed join code, if any. Call once after auth
 *  state resolves to a signed-in session, then resume the join at that code. */
export function consumePendingJoinCode(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_JOIN_CODE_KEY);
    if (code) sessionStorage.removeItem(PENDING_JOIN_CODE_KEY);
    return code;
  } catch {
    return null;
  }
}
