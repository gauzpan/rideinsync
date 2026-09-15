// General app feedback / grievances (see supabase/migrations/0035_app_feedback.sql).
// Distinct from ride_feedback (the per-ride post-trip survey). Stored in Supabase
// so RLS scopes each row to its author and the dashboard can review submissions.

import { supabase } from "./supabase";

export const FEEDBACK_MAX = 2000;

/**
 * File a piece of free-text feedback for the signed-in user. `userName` is a
 * denormalised snapshot of the submitter's display name; `context` records where
 * in the app it was sent from (e.g. "home", "ride_end").
 */
export async function submitAppFeedback(args: {
  userId: string;
  userName: string | null;
  message: string;
  context: string;
}): Promise<void> {
  const message = args.message.trim();
  if (!message) throw new Error("Write something first.");

  const { error } = await supabase.from("app_feedback").insert({
    user_id: args.userId,
    user_name: args.userName,
    message: message.slice(0, FEEDBACK_MAX),
    context: args.context,
  });
  if (error) throw error;
}
