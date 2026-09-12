// ============================================================================
// Flow 6 — Ending Journey: client service.
// Thin wrappers over the close_ride / reached_home RPCs, feedback writes, and
// the badge_awarded Realtime subscription. See flow6-plan.md.
// ============================================================================

import { supabase } from "./supabase";
import type {
  FeedbackSentiment,
  Ride,
  RideSummary,
  UserBadge,
  RideMember,
  TravelMode,
} from "./models";
import { levelForDistance, type Vehicle } from "../components/ui/RideBadge";

// travel_mode (DB) → badge Vehicle (design). No motorcycle 'trek' equivalent.
const VEHICLE_OF: Record<TravelMode, Vehicle> = {
  motorcycle: "bike",
  car: "car",
  cycle: "cycle",
};

/** Everything the summary screen renders in one shot. */
export type SummaryView = {
  me: string | null;
  ride: Ride | null;
  members: RideMember[];
  summary: RideSummary | null;
  badges: UserBadge[];
  /** Badge shelf: which vehicle + how many tiers the viewer has unlocked. */
  vehicle?: Vehicle;
  unlockedLevel?: number;
};

// ---- Local-only mock (git-ignored src/lib/flow6.mock.ts) --------------------
// Picked up ONLY when VITE_MOCK_FLOW6=1 and the file exists. import.meta.glob
// returns {} when the file is absent, so this never breaks a clean checkout.
const mockModules = import.meta.glob<{ mockView?: SummaryView }>("./flow6.mock.ts", {
  eager: true,
});
const mockView: SummaryView | undefined =
  import.meta.env.VITE_MOCK_FLOW6 === "1"
    ? Object.values(mockModules)[0]?.mockView
    : undefined;

/** One-shot load for the summary screen (mock-aware). */
export async function loadSummaryView(rideId: string): Promise<SummaryView> {
  if (mockView) return structuredClone(mockView);
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id ?? null;
  const { data: ride } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
  const [summary, members] = await Promise.all([getRideSummary(rideId), getHomeRoster(rideId)]);
  const badges = me ? await getRideBadges(rideId, me) : [];

  // Badge shelf: viewer's unlocked tier for this ride's vehicle, from lifetime
  // per-mode distance in user_stats.
  let vehicle: Vehicle | undefined;
  let unlockedLevel: number | undefined;
  if (ride) {
    vehicle = VEHICLE_OF[ride.travel_mode];
    if (me) {
      const { data: stat } = await supabase
        .from("user_stats")
        .select("distance_m")
        .eq("user_id", me)
        .eq("mode", ride.travel_mode)
        .maybeSingle();
      unlockedLevel = levelForDistance(vehicle, (stat?.distance_m ?? 0) / 1000);
    }
  }
  return { me, ride, members, summary, badges, vehicle, unlockedLevel };
}

/** Leader starts the ride: draft → active, which turns on live tracking, the
 *  SOS surface, and the active-ride hero. Direct update is allowed by the
 *  `rides_update` RLS policy (leader_id = auth.uid()). Idempotent: re-running on
 *  an already-active ride is a no-op. */
export async function startRide(rideId: string): Promise<void> {
  if (mockView) {
    if (mockView.ride) mockView.ride.status = "active";
    return;
  }
  const { error } = await supabase
    .from("rides")
    .update({ status: "active" })
    .eq("id", rideId)
    .eq("status", "draft");
  if (error) throw error;
}

/** Leader/co-leader finalizes the ride (idempotent server-side). */
export async function closeRide(rideId: string): Promise<void> {
  if (mockView) {
    if (mockView.ride) mockView.ride.status = "ended";
    return;
  }
  const { error } = await supabase.rpc("close_ride", { p_ride_id: rideId });
  if (error) throw error;
}

/** Rider marks themselves home after the ride (self only). */
export async function markReachedHome(rideId: string): Promise<void> {
  if (mockView) {
    const m = mockView.members.find((x) => x.user_id === mockView.me);
    if (m && !m.reached_home_at) {
      m.reached_home_at = new Date().toISOString();
      if (mockView.summary) mockView.summary.riders_home += 1;
    }
    return;
  }
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
  if (mockView) return; // feedback accepted in mock; nothing to persist
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
