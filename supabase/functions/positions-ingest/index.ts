// positions-ingest — validated, rate-limited GPS write path (M2 of
// docs/scale-readiness-roadmap.md). Replaces LiveOps.tsx's direct
// `rider_positions` insert with one Edge Function that:
//   1. verifies the caller's JWT matches the claimed user_id (same pattern as
//      supabase/functions/push-notify/index.ts:89-96),
//   2. verifies ride membership (via the existing is_ride_member() RPC, run
//      as the caller so its internal auth.uid() resolves correctly),
//   3. verifies the ride is 'active' (server-side; today the client only
//      stops watching on end, which is a soft guard),
//   4. re-applies M0's plausibility validation (0021_position_validation.sql)
//      as a fast-fail before hitting the DB — the DB trigger on
//      rider_positions stays the authoritative backstop, unchanged,
//   5. rate-limits to one accepted write per user per ride per ~3s,
//   6. upserts the hot `latest_positions` row, and samples into the cold
//      `rider_positions` history table roughly once per 10s of wall-clock
//      time per rider (see SAMPLE_BUCKET_MS below) instead of on every write.
//
// Request body: { ride_id: string; user_id: string; lat: number; lng: number;
// heading?: number|null; speed?: number|null; accuracy?: number|null;
// recorded_at?: string }.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Same 3s cadence the roadmap calls for: reject a second accepted write from
// the same user on the same ride inside this window. Checked against the
// existing latest_positions row's own `updated_at` (server-set, so immune to
// client clock skew) rather than adding new rate-limit state.
const RATE_LIMIT_MS = 3000;

// Sampling into rider_positions (history/close_ride) doesn't need every
// accepted write — only roughly one fix per ~10s per rider. Rather than track
// a separate "last sampled" timestamp, bucket `recorded_at` into 10s
// wall-clock windows and sample whenever a write lands in a new bucket vs.
// the previous accepted row. Stateless (reuses timestamps already on
// latest_positions), simple, and gives ~1 history row per 10s per rider
// regardless of how often ingest is called within that window.
const SAMPLE_BUCKET_MS = 10_000;

// CORS: the app calls this function from a browser (localhost in dev, the
// deployed PWA's origin in prod) via supabase.functions.invoke, which sends
// Authorization/apikey/Content-Type headers — all of which trigger a CORS
// preflight (OPTIONS). Without these headers + an OPTIONS handler the browser
// blocks the request before the POST is ever sent ("Failed to fetch"), so no
// position is ever written and no rider pin appears. Native (Capacitor) builds
// don't enforce CORS, which is why this only bites the web path.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Body = {
  ride_id?: string;
  user_id?: string;
  lat?: number;
  lng?: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  recorded_at?: string;
};

type LatestPositionRow = {
  lat: number;
  lng: number;
  recorded_at: string;
  updated_at: string;
  distance_m: number;
};

Deno.serve(async (req) => {
  // Answer the CORS preflight before anything else, with the headers the
  // browser needs, or the actual POST never fires from a web origin.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { ride_id, user_id, lat, lng } = body;
  const heading = body.heading ?? null;
  const speed = body.speed ?? null;
  const accuracy = body.accuracy ?? null;

  if (
    !ride_id ||
    !user_id ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return jsonResponse({ error: "Missing or invalid fields" }, 400);
  }

  // 1. The caller must be the rider they claim to be — same check as
  // push-notify's sender_user_id verification.
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: caller, error: authErr } = await callerClient.auth.getUser();
  if (authErr || caller.user?.id !== user_id) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // 2. Membership — run as the caller (via their JWT) so is_ride_member()'s
  // internal auth.uid() resolves to this user, reusing the existing
  // SECURITY DEFINER function instead of re-deriving the check here.
  const { data: isMember, error: memberErr } = await callerClient.rpc("is_ride_member", {
    rid: ride_id,
  });
  if (memberErr) {
    console.error("[positions-ingest] is_ride_member check failed", memberErr.message);
    return jsonResponse({ error: "Membership check failed" }, 500);
  }
  if (!isMember) {
    return jsonResponse({ error: "Not a member of this ride" }, 403);
  }

  // 3. Ride must be active — new server-side check (the client today only
  // stops watching on end, which is a soft guard only).
  const { data: ride, error: rideErr } = await serviceClient
    .from("rides")
    .select("status")
    .eq("id", ride_id)
    .single();
  if (rideErr || !ride) {
    return jsonResponse({ error: "Ride not found" }, 404);
  }
  if (ride.status !== "active") {
    return jsonResponse({ error: `Ride is ${ride.status}, not active` }, 409);
  }

  // 4. Plausibility validation — same checks as
  // validate_rider_position() (0021_position_validation.sql), applied here
  // as a fast-fail. The DB trigger on rider_positions remains the
  // authoritative backstop for whatever we do insert there below.
  if (lat < -90 || lat > 90) {
    return jsonResponse({ error: `lat out of range: ${lat}` }, 400);
  }
  if (lng < -180 || lng > 180) {
    return jsonResponse({ error: `lng out of range: ${lng}` }, 400);
  }

  const { data: prevRow, error: prevErr } = await serviceClient
    .from("latest_positions")
    .select("lat, lng, recorded_at, updated_at, distance_m")
    .eq("ride_id", ride_id)
    .eq("user_id", user_id)
    .maybeSingle<LatestPositionRow>();
  if (prevErr) {
    console.error("[positions-ingest] latest_positions lookup failed", prevErr.message);
    return jsonResponse({ error: "Lookup failed" }, 500);
  }

  const now = Date.now();
  const recordedAt = body.recorded_at ?? new Date(now).toISOString();
  const recordedAtMs = new Date(recordedAt).getTime();

  // Running distance total (M4.1, docs/scale-readiness-roadmap.md): the delta
  // between this fix and the rider's previous one, added to their running
  // total so close_ride can read a precomputed number instead of rescanning
  // rider_positions history. Reuses the same prevRow lookup already done for
  // the rate-limit/speed check above — no extra query. Skipped on the
  // first-ever fix for a rider (nothing to accumulate from; stays at the
  // column default of 0).
  let distanceM = prevRow?.distance_m ?? 0;

  if (prevRow) {
    // 5. Rate limit: reject a second accepted write inside RATE_LIMIT_MS,
    // checked against this row's own server-set updated_at.
    const sinceLastMs = now - new Date(prevRow.updated_at).getTime();
    if (sinceLastMs < RATE_LIMIT_MS) {
      return jsonResponse(
        { error: "Rate limited", retry_after_ms: RATE_LIMIT_MS - sinceLastMs },
        429,
      );
    }

    const distM = haversineMeters(prevRow, { lat, lng });
    distanceM = prevRow.distance_m + distM;

    // Speed plausibility vs. this user's most recent accepted fix.
    const elapsedHours = (recordedAtMs - new Date(prevRow.recorded_at).getTime()) / 3_600_000;
    if (elapsedHours > 0) {
      const impliedKmh = distM / 1000 / elapsedHours;
      if (impliedKmh > 250) {
        return jsonResponse(
          { error: `Implausible speed: ${impliedKmh.toFixed(1)} km/h` },
          400,
        );
      }
    }
  }

  // 6. Upsert the hot row.
  const { error: upsertErr } = await serviceClient.from("latest_positions").upsert(
    {
      ride_id,
      user_id,
      lat,
      lng,
      heading,
      speed,
      accuracy,
      recorded_at: recordedAt,
      distance_m: distanceM,
    },
    { onConflict: "ride_id,user_id" },
  );
  if (upsertErr) {
    console.error("[positions-ingest] latest_positions upsert failed", upsertErr.message);
    return jsonResponse({ error: "Write failed" }, 500);
  }

  // Sample into rider_positions (history/close_ride) roughly once per 10s
  // wall-clock bucket per rider — see SAMPLE_BUCKET_MS above. Best-effort:
  // its own trigger (validate_rider_position) is the authoritative backstop
  // and could still reject a rare racing write; that must never fail this
  // response since latest_positions already succeeded.
  const prevBucket = prevRow ? Math.floor(new Date(prevRow.recorded_at).getTime() / SAMPLE_BUCKET_MS) : null;
  const newBucket = Math.floor(recordedAtMs / SAMPLE_BUCKET_MS);
  const sampled = prevBucket === null || newBucket !== prevBucket;
  if (sampled) {
    const { error: sampleErr } = await serviceClient.from("rider_positions").insert({
      ride_id,
      user_id,
      lat,
      lng,
      heading,
      speed,
      accuracy,
      recorded_at: recordedAt,
    });
    if (sampleErr) {
      console.warn("[positions-ingest] rider_positions sample insert failed", sampleErr.message);
    }
  }

  return jsonResponse({ ok: true, sampled }, 200);
});
