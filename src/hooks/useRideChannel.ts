// Subscribe to a ride's live data and expose it as map-ready riders + events.
// Backs the Lead/Sweep ops view: latest position + group status per rider,
// roster + manual status (ride_members), and signals (ride_events, e.g. SOS).
//
// M3 (docs/scale-readiness-roadmap.md): group status used to be derived here
// on the client from raw `rider_positions` INSERTs (nearestGapMeters O(N) per
// rider, recomputed on nearly every incoming position). That's gone. A
// server-side aggregator now reads `latest_positions` on a 2s+ tick, computes
// each rider's status itself (deriveStatus's thresholds, ported to SQL —
// supabase/migrations/0024_broadcast_aggregator.sql), and broadcasts the
// whole ride's rider list as one `{type:'broadcast', event:'pack', payload}`
// message on this same `ride-<id>` channel. The client just renders it.
//
// This hook is also now the sole owner of the `ride-<id>` channel object
// (src/lib/rideChannel.ts's registry) — useSosAlerts, useNavigateOnRideEnd,
// and useRideSignalListener attach their own listeners to the same shared
// channel instead of opening their own, cutting per-client Realtime channel
// count for a ride screen from 3-4 down to 1.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { acquireRideChannel, type PgChangePayload } from "../lib/rideChannel";
import type { GroupStatus, LiveRiderPosition, Profile, RideEvent, RideMember, RiderOnMap } from "../lib/models";

// One entry per rider: their last-known fix (if any) plus the aggregator's
// verdict on their group status. `status: null` means no broadcast has
// landed yet for this rider since mount (fresh seed, pre-first-tick) — see
// the `riders` memo below for how that's treated.
type PackEntry = { position: LiveRiderPosition | null; status: GroupStatus | null };
type PackMap = Record<string, PackEntry>;
type MemberMap = Record<string, RideMember>;
type ProfileMap = Record<string, Profile>;

type PackPayload = {
  riders: Array<{
    user_id: string;
    lat: number | null;
    lng: number | null;
    heading: number | null;
    speed: number | null;
    accuracy: number | null;
    recorded_at: string | null;
    status: GroupStatus;
  }>;
};

export function useRideChannel(rideId: string | undefined) {
  const [members, setMembers] = useState<MemberMap>({});
  const [pack, setPack] = useState<PackMap>({});
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [events, setEvents] = useState<RideEvent[]>([]);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const fetchingProfile = useRef(new Set<string>());

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;

    async function seed() {
      supabase
        .from("rides")
        .select("status")
        .eq("id", rideId!)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) setRideStatus(data.status);
        });
      // M2/M3 seed simplification: latest_positions has one row per
      // (ride_id, user_id) already (PK), upserted by positions-ingest — no
      // ordering/limit/client-dedupe needed, unlike the old rider_positions
      // `.limit(500)` + newest-per-user scan this replaces.
      const [{ data: mem }, { data: pos }] = await Promise.all([
        supabase.from("ride_members").select("*").eq("ride_id", rideId!),
        supabase.from("latest_positions").select("*").eq("ride_id", rideId!),
      ]);
      if (cancelled) return;
      if (mem) setMembers(Object.fromEntries(mem.map((m) => [m.user_id, m])));
      if (pos) {
        // status: null — the aggregator, not this seed query, owns status,
        // and hasn't broadcast yet on first mount. The `riders` memo treats
        // a null status as "stale" until the first "pack" tick lands (≤ the
        // aggregator's 2s+ interval) — well inside the ~5s freshness SLA
        // the roadmap signed off on, so it's not worth re-deriving a
        // fallback status client-side just for that brief window.
        const seeded: PackMap = {};
        for (const p of pos) {
          seeded[p.user_id] = {
            position: {
              lat: p.lat,
              lng: p.lng,
              heading: p.heading,
              speed: p.speed,
              accuracy: p.accuracy,
              recorded_at: p.recorded_at,
            },
            status: null,
          };
        }
        setPack(seeded);
      }
      const ids = (mem ?? []).map((m) => m.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
        if (!cancelled && profs) setProfiles(Object.fromEntries(profs.map((p) => [p.id, p])));
      }
    }
    void seed();

    const handle = acquireRideChannel(rideId);

    const onPack = (msg: { payload: unknown }) => {
      const payload = msg.payload as PackPayload | undefined;
      if (!payload?.riders) return;
      // Full-snapshot semantics, not a delta: the aggregator ships every
      // active ride member's *current* status on every tick, so there's no
      // per-rider "newer wins" comparison to make — we just replace the map
      // wholesale each tick. (The old rider_positions listener needed a
      // recorded_at-newer-wins guard because each realtime event was one
      // rider's one row, not a full snapshot; that's no longer the shape
      // we're consuming, so that guard's reasoning no longer applies.)
      const next: PackMap = {};
      for (const r of payload.riders) {
        const hasFix = r.lat != null && r.lng != null && r.recorded_at != null;
        next[r.user_id] = {
          position: hasFix
            ? {
                lat: r.lat as number,
                lng: r.lng as number,
                heading: r.heading,
                speed: r.speed,
                accuracy: r.accuracy,
                recorded_at: r.recorded_at as string,
              }
            : null,
          status: r.status,
        };
      }
      setPack(next);
    };

    const onRideMembers = (payload: PgChangePayload) => {
      const m = payload.new as RideMember;
      if (!m?.user_id) return;
      setMembers((prev) => ({ ...prev, [m.user_id]: m }));
      setProfiles((prev) => {
        if (prev[m.user_id] || fetchingProfile.current.has(m.user_id)) return prev;
        fetchingProfile.current.add(m.user_id);
        void supabase
          .from("profiles")
          .select("*")
          .eq("id", m.user_id)
          .single()
          .then(({ data }) => {
            fetchingProfile.current.delete(m.user_id);
            if (data) setProfiles((p2) => ({ ...p2, [data.id]: data }));
          });
        return prev;
      });
    };

    const onRideEvents = (payload: PgChangePayload) =>
      setEvents((prev) => [payload.new as RideEvent, ...prev].slice(0, 30));

    const onRides = (payload: PgChangePayload) =>
      setRideStatus((payload.new as { status?: string }).status ?? null);

    handle.listeners.pack.add(onPack);
    handle.listeners.rideMembers.add(onRideMembers);
    handle.listeners.rideEvents.add(onRideEvents);
    handle.listeners.rides.add(onRides);

    return () => {
      cancelled = true;
      handle.listeners.pack.delete(onPack);
      handle.listeners.rideMembers.delete(onRideMembers);
      handle.listeners.rideEvents.delete(onRideEvents);
      handle.listeners.rides.delete(onRides);
      handle.release();
    };
  }, [rideId]);

  const riders: RiderOnMap[] = useMemo(() => {
    return Object.keys(members).map((id) => {
      const member = members[id];
      const entry = pack[id];
      const profile = profiles[id];
      // Manual member status wins immediately client-side (no need to wait
      // a tick for the aggregator to notice a ride_members change), matching
      // deriveStatus's old precedence; every other status comes straight
      // from the server's last broadcast.
      const status: GroupStatus =
        member.status === "stopped" || member.status === "leaving"
          ? "stopped"
          : entry?.status ?? "stale";
      return {
        member,
        profile: {
          id,
          display_name: profile?.display_name ?? "Rider",
          avatar_url: profile?.avatar_url ?? null,
        },
        latest: entry?.position ?? null,
        status,
      };
    });
  }, [members, pack, profiles]);

  return { riders, events, rideStatus };
}
