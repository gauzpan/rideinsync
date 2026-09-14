import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { acquireRideChannel, type PgChangePayload } from "./rideChannel";
import {
  isDemoBackend,
  demoName,
  demoAlerts,
  demoResponses,
  demoSendSos,
  demoRespond,
  demoMarkReached,
  demoCloseSos,
  demoStay,
  subscribe as subscribeDemo,
} from "./sosDemo";
import { triggerPushNotify } from "./pushNotifications";
import type {
  SosAlert,
  SosResponse,
  SosResponseInsert,
  RiderPositionInsert,
} from "./models";

// ============================================================================
// Flow 5 SOS — client library. All logs are prefixed "[sos]".
// Sending never blocks on GPS: a location read that denies/times out yields a
// null location and the alert is still raised.
// ============================================================================

type Pos = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

/** Read one position. Resolves null (never rejects) on deny/timeout/no-support. */
function readPosition(): Promise<Pos | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      console.warn("[sos] geolocation unavailable");
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
          heading: p.coords.heading ?? null,
          speed: p.coords.speed ?? null,
        }),
      (err) => {
        console.warn("[sos] geolocation unavailable", err.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

function positionInsert(rideId: string, userId: string, pos: Pos): RiderPositionInsert {
  return {
    ride_id: rideId,
    user_id: userId,
    lat: pos.lat,
    lng: pos.lng,
    heading: pos.heading,
    speed: pos.speed,
    accuracy: pos.accuracy,
  };
}

export type SendSosResult = { alertId: string; hasLocation: boolean };

/**
 * Raise an SOS. Order of operations:
 * 1. read location (best effort, never blocks),
 * 2. call raise_sos_alert RPC, which atomically:
 *    a. inserts sos_alerts (required — failure throws → error state),
 *    b. inserts rider_positions if we have a fix (best effort server-side),
 *    c. inserts ride_events type 'sos' (best effort server-side).
 * All 3 used to be separate unwrapped client round trips (required +
 * best-effort + best-effort); the RPC (0022_raise_sos_alert.sql) now does
 * them in one transaction, so a dropped connection can no longer leave a
 * sos_alerts row with no matching ride_events/rider_positions row. The
 * required-vs-best-effort semantics for each insert are unchanged.
 */
export async function sendSos(rideId: string, userId: string): Promise<SendSosResult> {
  if (isDemoBackend) return demoSendSos(rideId, userId);
  const pos = await readPosition();
  const payload = {
    location: pos
      ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, recorded_at: new Date().toISOString() }
      : null,
    note: pos ? undefined : "location_unavailable",
  };

  const { data, error } = await supabase.rpc("raise_sos_alert", {
    p_ride_id: rideId,
    p_user_id: userId,
    p_payload: payload,
  });
  if (error || !data) {
    console.warn("[sos] alert insert failed", error?.message);
    throw error ?? new Error("alert insert failed");
  }
  const alertId = data as string;

  // Critical tier, per PRD/signals_haptics_plan.md §8: never throttled, fires
  // regardless of the (best-effort) ride_events insert inside the RPC above.
  triggerPushNotify(rideId, userId, "sos");

  console.info("[sos] alert sent", { alertId, rideId, hasLocation: Boolean(pos) });
  return { alertId, hasLocation: Boolean(pos) };
}

const TRACK_INTERVAL_MS = 10_000;

async function ping(rideId: string, userId: string): Promise<void> {
  const pos = await readPosition();
  if (!pos) return;
  const { error } = await supabase
    .from("rider_positions")
    .insert(positionInsert(rideId, userId, pos));
  if (error) console.warn("[sos] position ping failed", error.message);
  else console.info("[sos] position ping", { rideId });
}

/** Start pinging the group's position every 10 s. Returns an interval handle. */
export function startSosTracking(rideId: string, userId: string): number {
  console.info("[sos] tracking started", { rideId });
  if (isDemoBackend) {
    // Demo: log the ping cadence, insert nothing.
    return window.setInterval(() => {
      console.info("[sos:demo] tracking ping (no insert)", { rideId });
    }, TRACK_INTERVAL_MS);
  }
  return window.setInterval(() => {
    void ping(rideId, userId);
  }, TRACK_INTERVAL_MS);
}

/** Stop a tracker started by startSosTracking. Safe to call with null. */
export function stopSosTracking(handle: number | null): void {
  if (handle == null) return;
  window.clearInterval(handle);
  console.info("[sos] tracking stopped");
}

/** Record that the current user is responding to an alert (unique per user). */
export async function respondToSos(alertId: string, rideId: string, userId: string): Promise<void> {
  if (isDemoBackend) return demoRespond(alertId, rideId, userId);
  const row: SosResponseInsert = { alert_id: alertId, ride_id: rideId, user_id: userId };
  const { error } = await supabase.from("sos_responses").insert(row);
  if (error) {
    console.warn("[sos] response insert failed", error.message);
    throw error;
  }
  console.info("[sos] response sent", { alertId, rideId });
}

/** Mark the current user's own response as having reached the rider. */
export async function markReached(responseId: string): Promise<void> {
  if (isDemoBackend) return demoMarkReached(responseId);
  const { error } = await supabase
    .from("sos_responses")
    .update({ reached_at: new Date().toISOString() })
    .eq("id", responseId);
  if (error) {
    console.warn("[sos] reached update failed", error.message);
    throw error;
  }
  console.info("[sos] reached", { responseId });
}

/** Resolve (close) an alert. Only the rider in distress may do this (RLS). */
export async function closeSos(alertId: string, userId: string): Promise<void> {
  if (isDemoBackend) return demoCloseSos(alertId, userId);
  const { error } = await supabase
    .from("sos_alerts")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", alertId);
  if (error) {
    console.warn("[sos] close failed", error.message);
    throw error;
  }
  console.info("[sos] closed", { alertId });
}

/**
 * Rider taps "Stay" — still needs help after a responder reported reaching them.
 * Sets stay_requested_at = now() on the alert (RLS: owner only). This re-shows
 * the member alert card for everyone (see sosCardState).
 */
export async function staySos(alertId: string, userId: string): Promise<void> {
  if (isDemoBackend) return demoStay(alertId);
  const { error } = await supabase
    .from("sos_alerts")
    .update({ stay_requested_at: new Date().toISOString() })
    .eq("id", alertId)
    .eq("user_id", userId);
  if (error) {
    console.warn("[sos] stay update failed", error.message);
    throw error;
  }
  console.info("[sos] stay requested", { alertId });
}

// ---- Receiving side ---------------------------------------------------------

async function fetchDisplayName(userId: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(userId);
  if (hit) return hit;
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const name = data?.display_name ?? "A rider";
  cache.set(userId, name);
  return name;
}

export type IncomingAlert = {
  id: string;
  userId: string;
  name: string;
  triggeredAt: string;
  resolved: boolean;
  stayRequestedAt: string | null;
};

/**
 * Visibility rule for the member alert card, shared by live + demo paths.
 * Given an alert and its responders:
 *   latestReached = newest reached_at across responders (or null);
 *   visible = not resolved AND (no one has reached yet OR the rider tapped Stay
 *             strictly after that latest reach);
 *   still   = visible AND at least one responder had reached (→ "still needs help").
 * Timestamps are compared via Date.parse so different clocks are safe.
 */
export function sosCardState(
  a: { resolved: boolean; stayRequestedAt: string | null },
  responders: Pick<Responder, "reachedAt">[],
): { visible: boolean; still: boolean } {
  const reachedTimes = responders
    .map((r) => r.reachedAt)
    .filter((t): t is string => Boolean(t));
  const latestReached = reachedTimes.length
    ? reachedTimes.reduce((m, t) => (Date.parse(t) > Date.parse(m) ? t : m))
    : null;
  const visible =
    !a.resolved &&
    (latestReached == null ||
      (a.stayRequestedAt != null && Date.parse(a.stayRequestedAt) > Date.parse(latestReached)));
  const still = visible && latestReached != null;
  return { visible, still };
}

/**
 * Live list of alerts in the ride, excluding the current user's own. Fetches
 * existing unresolved alerts on mount (so a member who opens the app late still
 * sees the card) and listens for INSERT and UPDATE. Each entry carries
 * resolved_at and stay_requested_at; sosCardState turns those (plus responders)
 * into the card's visibility — a resolved alert is simply not shown.
 */
export function useSosAlerts(rideId: string | null, selfUserId: string | null): IncomingAlert[] {
  const [alerts, setAlerts] = useState<IncomingAlert[]>([]);

  useEffect(() => {
    setAlerts([]);
    if (!rideId) return;

    if (isDemoBackend) {
      const derive = () =>
        setAlerts(
          demoAlerts()
            .filter((a) => a.ride_id === rideId && a.user_id !== selfUserId)
            .map((a) => ({
              id: a.id,
              userId: a.user_id,
              name: demoName(a.user_id),
              triggeredAt: a.triggered_at,
              resolved: Boolean(a.resolved_at),
              stayRequestedAt: a.stay_requested_at,
            })),
        );
      derive();
      return subscribeDemo(derive);
    }

    let active = true;
    const names = new Map<string, string>();

    async function add(row: SosAlert) {
      if (row.user_id === selfUserId) return;
      const name = await fetchDisplayName(row.user_id, names);
      if (!active) return;
      const resolved = Boolean(row.resolved_at);
      const stayRequestedAt = row.stay_requested_at;
      setAlerts((prev) =>
        prev.some((a) => a.id === row.id)
          ? prev.map((a) => (a.id === row.id ? { ...a, resolved, stayRequestedAt } : a))
          : [
              ...prev,
              { id: row.id, userId: row.user_id, name, triggeredAt: row.triggered_at, resolved, stayRequestedAt },
            ],
      );
    }

    function onUpdate(row: SosAlert) {
      if (row.user_id === selfUserId) return;
      const resolved = Boolean(row.resolved_at);
      const stayRequestedAt = row.stay_requested_at;
      if (resolved) console.info("[sos] resolved received", { alertId: row.id });
      setAlerts((prev) => prev.map((a) => (a.id === row.id ? { ...a, resolved, stayRequestedAt } : a)));
    }

    supabase
      .from("sos_alerts")
      .select("*")
      .eq("ride_id", rideId)
      .is("resolved_at", null)
      .order("triggered_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn("[sos] alert fetch failed", error.message);
          return;
        }
        data?.forEach((row) => void add(row as SosAlert));
      });

    // M3 channel consolidation: sos_alerts INSERT/UPDATE now ride on the
    // same shared `ride-<id>` channel useRideChannel owns (src/lib/
    // rideChannel.ts), instead of this hook opening its own
    // `ride:<id>:sos:*` channel. External contract (params in, alerts out)
    // is unchanged.
    const handle = acquireRideChannel(rideId);
    const onSosAlertsChange = (payload: PgChangePayload) => {
      const row = payload.new as SosAlert;
      if (payload.eventType === "INSERT") void add(row);
      else if (payload.eventType === "UPDATE") onUpdate(row);
    };
    handle.listeners.sosAlerts.add(onSosAlertsChange);

    return () => {
      active = false;
      handle.listeners.sosAlerts.delete(onSosAlertsChange);
      handle.release();
    };
  }, [rideId, selfUserId]);

  return alerts;
}

export type Responder = { id: string; userId: string; name: string; reachedAt: string | null };

/** Live map of alertId → responders (with names + reached state) for the ride. */
export function useSosResponses(rideId: string | null): Record<string, Responder[]> {
  const [byAlert, setByAlert] = useState<Record<string, Responder[]>>({});

  useEffect(() => {
    setByAlert({});
    if (!rideId) return;

    if (isDemoBackend) {
      const derive = () => {
        const next: Record<string, Responder[]> = {};
        for (const r of demoResponses()) {
          if (r.ride_id !== rideId) continue;
          (next[r.alert_id] ??= []).push({
            id: r.id,
            userId: r.user_id,
            name: demoName(r.user_id),
            reachedAt: r.reached_at,
          });
        }
        setByAlert(next);
      };
      derive();
      return subscribeDemo(derive);
    }

    let active = true;
    const names = new Map<string, string>();

    async function upsert(row: SosResponse) {
      const name = await fetchDisplayName(row.user_id, names);
      if (!active) return;
      const entry: Responder = { id: row.id, userId: row.user_id, name, reachedAt: row.reached_at };
      setByAlert((prev) => {
        const list = prev[row.alert_id] ?? [];
        const idx = list.findIndex((r) => r.id === row.id);
        if (idx === -1) return { ...prev, [row.alert_id]: [...list, entry] };
        const next = list.slice();
        next[idx] = entry;
        return { ...prev, [row.alert_id]: next };
      });
    }

    supabase
      .from("sos_responses")
      .select("*")
      .eq("ride_id", rideId)
      .then(({ data, error }) => {
        if (error) {
          console.warn("[sos] response fetch failed", error.message);
          return;
        }
        data?.forEach((row) => void upsert(row as SosResponse));
      });

    const channel = supabase
      .channel(`ride:${rideId}:sos-responses:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sos_responses",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const row = payload.new as SosResponse;
          if (row?.id) void upsert(row);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  return byAlert;
}
