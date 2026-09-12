import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { MemberRole } from "../lib/models";

export type MyRideItem = {
  id: string;
  name: string;
  code: string;
  status: "draft" | "active" | "ended" | "cancelled";
  role: MemberRole | "rider";
  startLabel: string | null;
  destinationLabel: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  endedAt: string | null;
  distanceKm: number | null;
  memberCount: number;
  isPending?: boolean;
};

export type MyRidesData = {
  loading: boolean;
  active: MyRideItem[];
  upcoming: MyRideItem[];
  past: MyRideItem[];
  isEmpty: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/** Resolves tap-through route based on ride status and user's role. */
export function getRideRoute(ride: {
  id: string;
  status: "draft" | "active" | "ended" | "cancelled";
  role?: string | null;
  isPending?: boolean;
}): string {
  if (ride.status === "cancelled") {
    return "";
  }
  if (ride.isPending) {
    return `/ride/${ride.id}`;
  }
  if (ride.status === "ended") {
    return `/ride/${ride.id}/summary`;
  }
  const isLeader = ride.role === "leader" || ride.role === "co_leader";
  if (ride.status === "draft") {
    return isLeader ? `/ride/${ride.id}/invite` : `/ride/${ride.id}`;
  }
  if (ride.status === "active") {
    return isLeader ? `/ride/${ride.id}/lead` : `/ride/${ride.id}`;
  }
  return `/ride/${ride.id}`;
}

export function useMyRides(): MyRidesData {
  const { user } = useAuth();
  const userId = user?.id;

  const [state, setState] = useState<Omit<MyRidesData, "refetch">>({
    loading: true,
    active: [],
    upcoming: [],
    past: [],
    isEmpty: false,
    error: null,
  });

  const load = useCallback(async () => {
    if (!userId) {
      setState({
        loading: false,
        active: [],
        upcoming: [],
        past: [],
        isEmpty: true,
        error: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const [memberships, joinRequests] = await Promise.all([
        safe(() =>
          supabase
            .from("ride_members")
            .select("ride_id, role")
            .eq("user_id", userId)
        ),
        safe(() =>
          supabase
            .from("ride_join_requests")
            .select("ride_id, requested_at, status")
            .eq("user_id", userId)
            .eq("status", "pending")
        ),
      ]);

      const memberRideIds = memberships.map((m) => m.ride_id);
      const roleByRideId = new Map(
        memberships.map((m) => [m.ride_id, (m.role as MemberRole) ?? "rider"])
      );

      // Filter out any pending requests for rides where user is already a member
      const pendingRideIds = joinRequests
        .map((j) => j.ride_id)
        .filter((id) => !roleByRideId.has(id));

      const allRideIds = [...new Set([...memberRideIds, ...pendingRideIds])];

      if (allRideIds.length === 0) {
        setState({
          loading: false,
          active: [],
          upcoming: [],
          past: [],
          isEmpty: true,
          error: null,
        });
        return;
      }

      // Fetch ride rows and member counts
      const [rides, allMembers] = await Promise.all([
        safe(() =>
          supabase
            .from("rides")
            .select(
              "id, name, code, status, ended_at, scheduled_start, scheduled_end, start_point, destination, created_at"
            )
            .in("id", allRideIds)
        ),
        safe(() =>
          supabase.from("ride_members").select("ride_id").in("ride_id", allRideIds)
        ),
      ]);

      const countByRideId = new Map<string, number>();
      for (const m of allMembers) {
        countByRideId.set(m.ride_id, (countByRideId.get(m.ride_id) ?? 0) + 1);
      }

      // Distances from summaries for ended rides
      const endedIds = rides.filter((r) => r.status === "ended").map((r) => r.id);
      const distanceByRideId = new Map<string, number>();
      if (endedIds.length > 0) {
        const summaries = await safe(() =>
          supabase
            .from("ride_summaries")
            .select("ride_id, total_distance_m")
            .in("ride_id", endedIds)
        );
        for (const s of summaries) {
          if (s.total_distance_m != null) {
            distanceByRideId.set(
              s.ride_id,
              Math.round(s.total_distance_m / 100) / 10
            );
          }
        }
      }

      const rideById = new Map(rides.map((r) => [r.id, r]));

      const activeList: MyRideItem[] = [];
      const upcomingList: MyRideItem[] = [];
      const pastList: MyRideItem[] = [];

      // Process memberships
      for (const m of memberships) {
        const r = rideById.get(m.ride_id);
        if (!r) continue;

        const role = (m.role as MemberRole) ?? "rider";
        const item: MyRideItem = {
          id: r.id,
          name: r.name,
          code: r.code,
          status: r.status as "draft" | "active" | "ended" | "cancelled",
          role,
          startLabel:
            (r.start_point as { label?: string } | null)?.label ?? null,
          destinationLabel:
            (r.destination as { label?: string } | null)?.label ?? null,
          scheduledStart: r.scheduled_start,
          scheduledEnd: r.scheduled_end,
          endedAt: r.ended_at,
          distanceKm: distanceByRideId.get(r.id) ?? null,
          memberCount: countByRideId.get(r.id) ?? 0,
          isPending: false,
        };

        if (item.status === "active") {
          activeList.push(item);
        } else if (item.status === "ended" || item.status === "cancelled") {
          pastList.push(item);
        } else {
          // draft status -> Upcoming section
          upcomingList.push(item);
        }
      }

      // Process pending join requests -> Upcoming section (or Past if cancelled)
      for (const j of joinRequests) {
        if (roleByRideId.has(j.ride_id)) continue;
        const r = rideById.get(j.ride_id);
        const itemStatus = (r?.status as "draft" | "active" | "ended" | "cancelled") ?? "draft";
        const item: MyRideItem = {
          id: j.ride_id,
          name: r?.name ?? "Requested ride",
          code: r?.code ?? "",
          status: itemStatus,
          role: "rider",
          startLabel: r
            ? (r.start_point as { label?: string } | null)?.label ?? null
            : null,
          destinationLabel: r
            ? (r.destination as { label?: string } | null)?.label ?? null
            : null,
          scheduledStart: r?.scheduled_start ?? null,
          scheduledEnd: r?.scheduled_end ?? null,
          endedAt: r?.ended_at ?? null,
          distanceKm: null,
          memberCount: countByRideId.get(j.ride_id) ?? 0,
          isPending: true,
        };
        if (itemStatus === "cancelled") {
          pastList.push(item);
        } else {
          upcomingList.push(item);
        }
      }

      // Sort upcoming by scheduledStart ascending (earliest first)
      upcomingList.sort((a, b) => {
        if (a.scheduledStart && b.scheduledStart) {
          return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
        }
        if (a.scheduledStart) return -1;
        if (b.scheduledStart) return 1;
        return 0;
      });

      // Sort past by endedAt / scheduledStart descending (newest first)
      pastList.sort((a, b) => {
        const timeA = new Date(a.endedAt || a.scheduledStart || 0).getTime();
        const timeB = new Date(b.endedAt || b.scheduledStart || 0).getTime();
        return timeB - timeA;
      });

      const isEmpty =
        activeList.length === 0 &&
        upcomingList.length === 0 &&
        pastList.length === 0;

      setState({
        loading: false,
        active: activeList,
        upcoming: upcomingList,
        past: pastList,
        isEmpty,
        error: null,
      });
    } catch {
      // Defensive fallback per spec: error resolves to clean empty state
      setState({
        loading: false,
        active: [],
        upcoming: [],
        past: [],
        isEmpty: true,
        error: null,
      });
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) {
        setState({
          loading: false,
          active: [],
          upcoming: [],
          past: [],
          isEmpty: true,
          error: null,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return {
    ...state,
    refetch: load,
  };
}

/** Runs a PostgREST query, returning rows or [] on error. */
async function safe<T>(run: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data } = await run();
    return data ?? [];
  } catch {
    return [];
  }
}
