// loadtest/positions_ingest.js — M5 load test (docs/scale-readiness-roadmap.md
// M5.4): ~1000 virtual riders spread across ~20-50 concurrent SMALL rides
// (not one mega-ride), each calling positions-ingest at ~0.2Hz (one call
// every ~5s), asserting p95 latency against the confirmed ~5s freshness SLA.
//
// Setup: run `node loadtest/seed.mjs --rides <R> --members <M>` FIRST. It
// creates R real `is_demo` rides with ~M+1 real members each (via the app's
// own request_join_ride RPC + RLS, no service-role shortcuts) and writes
// loadtest/vus.json — one {ride_id, user_id, access_token, start_lat,
// start_lng} entry per rider. This script can't do that itself: k6's own
// init-context `open()`/`setup()` run inside k6's JS runtime, which has no
// `fetch`-based Supabase client and can't import src/lib/session.ts — so the
// realistic guest-sign-in + join flow is replicated once, up front, in plain
// Node (seed.mjs) rather than reinvented inside k6.
//
// What's asserted vs. what's documented-only (task instructions are explicit
// that either is acceptable for this pass): this script asserts p95 *ingest
// call* latency (http_req_duration on the positions-ingest POST) against the
// SLA, NOT end-to-end broadcast lag — k6 has no websocket/Realtime client, so
// observing the "pack" broadcast landing in a browser isn't practical from
// here. To verify broadcast lag separately (not automated by this script):
//   1. Note the request time you send a fix.
//   2. Query `select inserted_at from realtime.messages where topic =
//      'realtime:ride-<rideId>' order by inserted_at desc limit 5;` (or watch
//      the aggregator's own cadence — it runs every 2s per
//      0024_broadcast_aggregator.sql's pg_cron schedule) and diff against the
//      ingest call time. Given the aggregator's fixed 2s tick, worst-case
//      broadcast lag is bounded at (tick interval) + (query/broadcast time),
//      comfortably inside the ~5s SLA independent of ingest call latency,
//      since the two are decoupled (ingest writes latest_positions; the
//      aggregator polls it on its own schedule, not per-write).
//
// Usage (dry run — see the report for actual numbers):
//   k6 run --env FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1 \
//          --env ANON_KEY=<local anon key> \
//          --env VUS_FILE=./loadtest/vus.json \
//          --env DURATION=30s \
//          loadtest/positions_ingest.js
//
// Full-shape run (not attempted locally — see report for why): scale
// seed.mjs to --rides 25 --members 39 (≈1000 riders across 25 small rides)
// and pass a matching VUS_FILE; k6 `vus` below is derived from the file size
// so no separate --vus flag is needed.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";

const FUNCTIONS_URL = __ENV.FUNCTIONS_URL || "http://127.0.0.1:54321/functions/v1";
const ANON_KEY = __ENV.ANON_KEY;
const VUS_FILE = __ENV.VUS_FILE || "./vus.json";
const DURATION = __ENV.DURATION || "30s";
// 0.2Hz per rider ~= one call every 5s. Ingest's own rate limit
// (positions-ingest/index.ts RATE_LIMIT_MS = 3000) means anything faster than
// ~3s per rider would start drawing 429s by design — 5s stays comfortably
// clear of that while matching the roadmap's confirmed cadence.
const TICK_S = Number(__ENV.TICK_S || 5);

if (!ANON_KEY) {
  throw new Error("Set --env ANON_KEY=<local anon key> (see `npx supabase status`).");
}

// SharedArray loads the file once and shares it read-only across VUs
// (cheap — no per-VU copy) instead of every VU re-reading/parsing it.
const riders = new SharedArray("riders", function () {
  return JSON.parse(open(VUS_FILE));
});

const ingestLatency = new Trend("ingest_latency_ms");
const ingestErrorRate = new Rate("ingest_error_rate");
const rateLimitedRate = new Rate("ingest_rate_limited");

export const options = {
  scenarios: {
    small_rides: {
      executor: "per-vu-iterations",
      vus: riders.length,
      iterations: Math.max(1, Math.floor(Number(DURATION.replace("s", "")) / TICK_S)),
      maxDuration: `${Number(DURATION.replace("s", "")) + 30}s`,
    },
  },
  thresholds: {
    // The ~5s end-to-end freshness SLA (docs/scale-readiness-roadmap.md) is
    // for ingest->broadcast, not the ingest call alone — this is the
    // narrower "ingest call latency stays reasonable under load" proxy the
    // task explicitly allows as a fallback. 1000ms is a generous ceiling for
    // a single Edge Function round-trip against a local/small Postgres; ratchet
    // down once real infra numbers exist.
    ingest_latency_ms: ["p(95)<1000"],
    ingest_error_rate: ["rate<0.05"],
  },
};

// Small deterministic-ish jittered walk around each rider's seeded start
// point, so positions look plausible (slow movement) rather than static or
// randomly teleporting every tick.
function jitterStep(lat, lng) {
  const metersPerDegLat = 111_320;
  const dMeters = 3 + Math.random() * 5; // ~3-8m per 5s tick == slow-moving traffic
  const bearing = Math.random() * 2 * Math.PI;
  const dLat = (Math.cos(bearing) * dMeters) / metersPerDegLat;
  const dLng = (Math.sin(bearing) * dMeters) / (metersPerDegLat * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

// Per-VU running position. Module-level state is safe here because k6 gives
// each VU its own isolated JS runtime instance (this module is re-evaluated
// once per VU, not shared across VUs).
let pos = null;

export default function () {
  const me = riders[(__VU - 1) % riders.length];
  if (!pos) pos = { lat: me.start_lat, lng: me.start_lng };
  const next = jitterStep(pos.lat, pos.lng);
  pos = next;

  const res = http.post(
    `${FUNCTIONS_URL}/positions-ingest`,
    JSON.stringify({
      ride_id: me.ride_id,
      user_id: me.user_id,
      lat: next.lat,
      lng: next.lng,
      heading: Math.floor(Math.random() * 360),
      speed: 5 + Math.random() * 3,
      accuracy: 8,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${me.access_token}`,
      },
      tags: { name: "positions-ingest" },
    },
  );

  ingestLatency.add(res.timings.duration);
  const rateLimited = res.status === 429;
  rateLimitedRate.add(rateLimited);
  // A 429 is an expected/correct response under this milestone's rate limit,
  // not a failure of the endpoint — count only non-2xx-non-429 as an error.
  ingestErrorRate.add(!rateLimited && res.status !== 200);
  check(res, {
    "status is 200 or 429 (rate-limited is expected, not an error)": (r) => r.status === 200 || r.status === 429,
  });

  sleep(TICK_S);
}
