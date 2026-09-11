// Anonymous guest sessions (Option B: riders join as guests).
// - ensureGuestSession: give the main client a guest session if it has none.
// - makeGuestClient: an isolated client with its own session, used to spin up
//   each simulated rider (each pushes ONLY its own positions — RLS requires
//   user_id = auth.uid(), so every sim rider needs its own session).

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabase } from "./supabase";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Ensure the shared client is signed in (as a guest) and return the user id. */
export async function ensureGuestSession(displayName: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: displayName, is_guest: true } },
  });
  if (error) throw error;
  return signed.user!.id;
}

export type GuestClient = { client: SupabaseClient<Database>; userId: string };

/**
 * A throwaway client with its own anonymous session and storage key, so it
 * never clobbers the main leader/viewer session. Session is not persisted.
 */
export async function makeGuestClient(displayName: string): Promise<GuestClient> {
  const client = createClient<Database>(url, anonKey, {
    auth: {
      storageKey: `sb-sim-${crypto.randomUUID()}`,
      persistSession: false,
      autoRefreshToken: true,
    },
  });
  const { data, error } = await client.auth.signInAnonymously({
    options: { data: { display_name: displayName, is_guest: true } },
  });
  if (error) throw error;
  return { client, userId: data.user!.id };
}
