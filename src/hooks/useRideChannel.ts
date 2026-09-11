// Subscribe to a ride's live data and expose it as map-ready riders + events.
// Backs the Lead/Sweep ops view: latest position per rider (Realtime INSERTs on
// rider_positions), roster + manual status (ride_members), and signals
// (ride_events, e.g. SOS). Group status is derived on the client.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile, RideEvent, RideMember, RiderOnMap, RiderPosition } from "../lib/models";
import { deriveStatus, nearestGapMeters } from "../lib/geo";
import type { LatLng } from "../lib/geo";

type PosMap = Record<string, RiderPosition>;
type MemberMap = Record<string, RideMember>;
type ProfileMap = Record<string, Profile>;

export function useRideChannel(rideId: string | undefined) {
  const [members, setMembers] = useState<MemberMap>({});
  const [positions, setPositions] = useState<PosMap>({});
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [events, setEvents] = useState<RideEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Re-derive freshness (stale detection) on a light heartbeat.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;

    async function seed() {
      const [{ data: mem }, { data: pos }] = await Promise.all([
        supabase.from("ride_members").select("*").eq("ride_id", rideId!),
        supabase
          .from("rider_positions")
          .select("*")
          .eq("ride_id", rideId!)
          .order("recorded_at", { ascending: false })
          .limit(500),
      ]);
      if (cancelled) return;
      if (mem) setMembers(Object.fromEntries(mem.map((m) => [m.user_id, m])));
      if (pos) {
        const latest: PosMap = {};
        for (const p of pos) if (!latest[p.user_id]) latest[p.user_id] = p; // desc order → first is newest
        setPositions(latest);
      }
      const ids = (mem ?? []).map((m) => m.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
        if (!cancelled && profs) setProfiles(Object.fromEntries(profs.map((p) => [p.id, p])));
      }
    }
    void seed();

    const channel = supabase
      .channel(`ride-${rideId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rider_positions", filter: `ride_id=eq.${rideId}` },
        (payload) => {
          const p = payload.new as RiderPosition;
          setPositions((prev) => {
            const cur = prev[p.user_id];
            if (cur && cur.recorded_at > p.recorded_at) return prev;
            return { ...prev, [p.user_id]: p };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ride_members", filter: `ride_id=eq.${rideId}` },
        (payload) => {
          const m = payload.new as RideMember;
          if (!m?.user_id) return;
          setMembers((prev) => ({ ...prev, [m.user_id]: m }));
          setProfiles((prev) => {
            if (prev[m.user_id]) return prev;
            void supabase
              .from("profiles")
              .select("*")
              .eq("id", m.user_id)
              .single()
              .then(({ data }) => {
                if (data) setProfiles((p2) => ({ ...p2, [data.id]: data }));
              });
            return prev;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ride_events", filter: `ride_id=eq.${rideId}` },
        (payload) => setEvents((prev) => [payload.new as RideEvent, ...prev].slice(0, 30)),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [rideId]);

  const riders: RiderOnMap[] = useMemo(() => {
    const ids = Object.keys(members);
    // Fresh position per rider (recent enough to count for gap/pack maths).
    const freshById: Record<string, LatLng> = {};
    for (const id of ids) {
      const p = positions[id];
      if (p && now - new Date(p.recorded_at).getTime() <= 20_000) {
        freshById[id] = { lat: p.lat, lng: p.lng };
      }
    }

    return ids.map((id) => {
      const member = members[id];
      const latest = positions[id] ?? null;
      const pos = latest ? { lat: latest.lat, lng: latest.lng } : null;
      const others = Object.entries(freshById)
        .filter(([oid]) => oid !== id)
        .map(([, p]) => p);
      const status = deriveStatus({
        memberStatus: member.status,
        pos,
        recordedAt: latest?.recorded_at ?? null,
        nearestGap: pos ? nearestGapMeters(pos, others) : null,
        now,
      });
      const profile = profiles[id];
      return {
        member,
        profile: {
          id,
          display_name: profile?.display_name ?? "Rider",
          avatar_url: profile?.avatar_url ?? null,
        },
        latest,
        status,
      };
    });
  }, [members, positions, profiles, now]);

  return { riders, events };
}
