import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Real-time backend (see ARCHITECTURE.md). Configure keys in .env.local.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Non-fatal during scaffolding — no queries are made yet.
  console.warn("[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set.");
}

/** True only when real keys are configured; false in keyless demo mode. */
export const supabaseConfigured = Boolean(url && anonKey);

// Typed against the schema in supabase/migrations/0001_foundation.sql.
// createClient throws "supabaseUrl is required." on an empty url, which would
// crash every route at module load; fall back to harmless placeholders so the
// keyless demo backend can take over instead.
export const supabase = createClient<Database>(
  url || "http://localhost:54321",
  anonKey || "public-anon-key-missing",
);
