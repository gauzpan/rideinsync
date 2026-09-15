import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { DEMO_RIDE_ID } from "../lib/activeRide";
import { useAuth } from "./useAuth";
import type { MemberRole } from "../lib/models";

// Demo mode: no Supabase keys, lib/activeRide short-circuits to the seed ride so
// the SOS button shows. Home must be self-consistent and render that same seed
// ride (Nandi Hills Sunrise Run, DEMO01, seed.sql) as the active card rather
// than hang querying an absent backend.
const DEMO = import.meta.env.VITE_DEMO_SESSION === "1";

// Data backing the post-login landing (/home). Queries are defensive: a missing
// backend, a dev session, or empty tables all resolve to quiet empty state
// rather than an error. Stats are demo constants until Flow 2's user_stats
// pipeline lands (see DEMO_STATS below).

export type ActiveRide = {
  id: string;
  name: string;
  code: string;
  role: MemberRole;
  riderCount: number;
    /** 'active' = ride underway; 'draft' = created but not started yet. Drafts
   *  are surfaced too so a lead can reopen (and start) a ride they made,
   *  instead of it being stranded with no Home entry point. */
  status: "active" | "draft";
};


export type PastRide = {
  rideId: string;
  name: string;
  endedAt: string;
  distanceKm: number;
};

export type Completeness = { done: number; total: number };

export type HomeStats = { rides: number; distanceKm: number; ridesLed: number };

// Demo-mode-only stand-in (no backend to aggregate against). Real sessions
// compute HomeStats live below from ride_members + ride_summaries.
const DEMO_STATS: HomeStats = { rides: 12, distanceKm: 486, ridesLed: 3 };
const EMPTY_STATS: HomeStats = { rides: 0, distanceKm: 0, ridesLed: 0 };

export type HomeData = {
  loading: boolean;
  activeRide: ActiveRide | null;
  completeness: Completeness;
  stats: HomeStats;
  pastRides: PastRide[];
  /** True once we know there is no active ride and no history — drives empty state. */
  isEmpty: boolean;
};

const COMPLETENESS_TOTAL = 4; // avatar · vehicle · medical · driving licence

/**
 * The resolved-immediately Home state for demo mode: the seed ride (values from
 * supabase/seed.sql) as the active ride, no history, demo stats. Exported as a
 * pure seam so it can be asserted without a live backend or env override.
 */
export function demoHomeData(): HomeData {
  return {
    loading: false,
    activeRide: {
      id: DEMO_RIDE_ID,
      name: "Nandi Hills Sunrise Run",
      code: "DEMO01",
      role: "leader",
      riderCount: 4,
      status: "active",
    },
    completeness: { done: 0, total: COMPLETENESS_TOTAL },
    stats: DEMO_STATS,
    pastRides: [],
    isEmpty: false,
  };
}

export function useHomeData(): HomeData {
  const { user, profile } = useAuth();
  const [state, setState] = useState<HomeData>(
    DEMO
      ? demoHomeData()
      : {
          loading: true,
          activeRide: null,
          completeness: { done: 0, total: COMPLETENESS_TOTAL },
          stats: EMPTY_STATS,
          pastRides: [],
          isEmpty: false,
        },
  );

  const userId = user?.id;
  const avatarDone = !!profile?.avatar_url;

  useEffect(() => {
    if (DEMO) return; // demo state is resolved synchronously; never query
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const [memberships, vehicle, medical, licence] = await Promise.all([
        safe(() => supabase.from("ride_members").select("ride_id, role").eq("user_id", userId)),
        safe(() => supabase.from("vehicles").select("id").eq("user_id", userId).limit(1)),
        safe(() => supabase.from("medical_profiles").select("user_id").eq("user_id", userId).limit(1)),
        safe(() =>
          supabase.from("documents").select("id").eq("user_id", userId).eq("type", "license").limit(1)
        ),
      ]);

      const done =
        (avatarDone ? 1 : 0) +
        (vehicle.length ? 1 : 0) +
        (medical.length ? 1 : 0) +
        (licence.length ? 1 : 0);

      const rideIds = memberships.map((m) => m.ride_id);
      let activeRide: ActiveRide | null = null;
      let pastRides: PastRide[] = [];
      let stats: HomeStats = {
        rides: rideIds.length,
        distanceKm: 0,
        ridesLed: memberships.filter((m) => m.role === "leader" || m.role === "co_leader").length,
      };

      if (rideIds.length) {
        const rides = await safe(() =>
          // Demo rides (the /ride/demo simulation) never surface on Home — not
          // as the active card, not as history.
          supabase.from("rides").select("id, name, code, status, ended_at, created_at").in("id", rideIds).eq("is_demo", false)
        );
        // Prefer a live ride; otherwise fall back to the most recent draft the
        // user is in, so a created-but-unstarted ride (e.g. one just made or
        // just joined pre-start) is reachable from Home instead of stranded.
        const active = rides.find((r) => r.status === "active");
        
        const latestDraft = rides
          .filter((r) => r.status === "draft")
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
        const hero = active ?? latestDraft;
        if (hero) {
          const roleRow = memberships.find((m) => m.ride_id === hero.id);
          const members = await safe(() =>
            supabase.from("ride_members").select("id").eq("ride_id", hero.id)
          );
          activeRide = {
            id: hero.id,
            name: hero.name,
            code: hero.code,
            role: (roleRow?.role as MemberRole) ?? "rider",
            riderCount: members.length,
            status: hero.status === "active" ? "active" : "draft",
          };
        }

        const endedIds = rides.filter((r) => r.status === "ended").map((r) => r.id);
        if (endedIds.length) {
          // Unlimited — the stats strip needs the *total* across every ended
          // ride the user was in, not just the recent slice shown as pastRides.
          const summaries = await safe(() =>
            supabase
              .from("ride_summaries")
              .select("ride_id, total_distance_m, ended_at")
              .in("ride_id", endedIds)
              .order("ended_at", { ascending: false })
          );
          const nameById = new Map(rides.map((r) => [r.id, r.name]));
          pastRides = summaries.slice(0, 5).map((s) => ({
            rideId: s.ride_id,
            name: nameById.get(s.ride_id) ?? "Ride",
            endedAt: s.ended_at,
            distanceKm: Math.round((s.total_distance_m ?? 0) / 100) / 10,
          }));
          const totalDistanceM = summaries.reduce((sum, s) => sum + (s.total_distance_m ?? 0), 0);
          stats = { ...stats, distanceKm: Math.round(totalDistanceM / 1000) };
        }
      }

      if (cancelled) return;
      setState({
        loading: false,
        activeRide,
        completeness: { done, total: COMPLETENESS_TOTAL },
        stats,
        pastRides,
        isEmpty: !activeRide && pastRides.length === 0,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, avatarDone]);

  return state;
}

/** Runs a PostgREST query, returning its rows or [] on any error/empty. */
async function safe<T>(run: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data } = await run();
    return data ?? [];
  } catch {
    return [];
  }
}
