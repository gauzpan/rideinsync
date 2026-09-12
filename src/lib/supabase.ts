import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Real-time backend (see ARCHITECTURE.md). Configure keys in .env.local.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // createClient THROWS on an empty URL, which would blank the whole app before
  // any keys are set. Fall back to a valid placeholder so the app still renders;
  // queries simply fail at runtime until real keys land in .env.local.
  console.warn("[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — using a placeholder client.");
}

/** True only when real keys are configured; false in keyless demo mode. */
export const supabaseConfigured = Boolean(url && anonKey);

// Typed against the schema in supabase/migrations/0001_foundation.sql.
// PKCE flow: OAuth returns a short-lived `?code=` (query, not a hash token),
// which supabase-js auto-exchanges and strips from the URL. Avoids the
// implicit-flow trap where a leftover `#access_token` lingers in the URL and
// poisons the next sign-in (see authService.signInWithGoogle's stable redirect).
// Placeholder URL/key fall-backs keep createClient from throwing (and blanking
// the app) before real keys land in .env.local.
export const supabase = createClient<Database>(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
  // PKCE so native (Capacitor) Google OAuth can exchange the deep-link code for
  // a session; works on web too.
  { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
