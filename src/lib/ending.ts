// ============================================================================
// Flow 6 — Ending Journey: client service.
// Thin wrappers over the close_ride / reached_home RPCs, feedback writes, and
// the badge_awarded Realtime subscription. See flow6-plan.md.
// ============================================================================

import { supabase } from "./supabase";
import type {
  FeedbackSentiment,
  RideSummary,
  UserBadge,
  RideMember,
} from "./models";

/** Leader/co-leader finalizes the ride (idempotent server-side). */
export async function closeRide(rideId: string): Promise<void> {
  const { error } = await supabase.rpc("close_ride", { p_ride_id: rideId });
  if (error) throw error;
}

/** Rider marks themselves home after the ride (self only). */
export async function markReachedHome(rideId: string): Promise<void> {
  const { error } = await supabase.rpc("reached_home", { p_ride_id: rideId });
  if (error) throw error;
}

/** Optional one-time per-rider trip feedback. */
export async function submitFeedback(input: {
  rideId: string;
  userId: string;
  sentiment: FeedbackSentiment;
  likedText?: string;
  improveText?: string;
}): Promise<void> {
  const { error } = await supabase.from("ride_feedback").upsert(
    {
      ride_id: input.rideId,
      user_id: input.userId,
      sentiment: input.sentiment,
      liked_text: input.likedText ?? null,
      improve_text: input.improveText ?? null,
    },
    { onConflict: "ride_id,user_id" }
  );
  if (error) throw error;
}

/** Pod roll-up for the summary screen. */
export async function getRideSummary(rideId: string): Promise<RideSummary | null> {
  const { data, error } = await supabase
    .from("ride_summaries")
    .select("*")
    .eq("ride_id", rideId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Badges the current user earned in this ride. */
export async function getRideBadges(rideId: string, userId: string): Promise<UserBadge[]> {
  const { data, error } = await supabase
    .from("user_badges")
    .select("*")
    .eq("ride_id", rideId)
    .eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

/** Home-ack roster for the Lead ("N/M home"). */
export async function getHomeRoster(rideId: string): Promise<RideMember[]> {
  const { data, error } = await supabase
    .from("ride_members")
    .select("*")
    .eq("ride_id", rideId);
  if (error) throw error;
  return data ?? [];
}

/** Subscribe to badge_awarded events for the summary/dashboard announcement. */
export function subscribeToBadges(
  rideId: string,
  onBadge: (payload: { badge_key: string; user_id: string }) => void
) {
  const channel = supabase
    .channel(`badges:${rideId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "ride_events", filter: `ride_id=eq.${rideId}` },
      (msg) => {
        const row = msg.new as { type: string; user_id: string; payload: { badge_key?: string } | null };
        if (row.type === "badge_awarded" && row.payload?.badge_key) {
          onBadge({ badge_key: row.payload.badge_key, user_id: row.user_id });
        }
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
