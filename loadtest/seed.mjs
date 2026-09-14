#!/usr/bin/env node
// loadtest/seed.mjs — M5 load-test setup (docs/scale-readiness-roadmap.md M5.4).
//
// k6 itself is plain JS/Go and can't import src/lib/session.ts, so this is a
// separate Node script (run once, before k6) that replicates the *minimal*
// HTTP calls src/lib/session.ts's ensureGuestSession/makeGuestClient make via
// supabase-js, using plain fetch against the local GoTrue + PostgREST APIs:
//
//   - guest sign-in: POST {SUPABASE_URL}/auth/v1/signup with an `apikey`
//     header and `{ data: { display_name, is_guest: true } }` body — this is
//     exactly what supabase-js's `signInAnonymously()` does under the hood
//     (see node_modules/@supabase/auth-js/dist/module/GoTrueClient.js,
//     `signInAnonymously`), so it produces the same kind of anonymous
//     session + JWT a real guest rider gets.
//   - ride creation / joining: plain PostgREST calls (POST/PATCH on
//     /rest/v1/rides, /rest/v1/ride_members) and one RPC
//     (/rest/v1/rpc/request_join_ride), gated by each session's own JWT so
//     the exact same RLS policies a real client hits are exercised — no
//     service-role shortcuts.
//
// Design choice for "real request/approve flow" vs. `is_demo` auto-approve:
// this uses `is_demo=true` rides. Rationale: request_join_ride() already
// auto-approves membership for is_demo rides in one RPC call (see
// supabase/migrations/0001_foundation.sql:424-450), so seeding N rides x M
// members needs only 1 RPC call per member instead of 1 request + 1
// leader-side approval call per member. This keeps setup fast for the
// 1000-rider target shape without touching the real (non-demo) approval
// path's own correctness, which isn't what this load test is exercising —
// positions-ingest doesn't care how membership was created, only that it
// exists (it calls the same is_ride_member() RPC either way).
//
// Output: loadtest/vus.json — a flat array of
//   { ride_id, user_id, access_token, start_lat, start_lng }
// one entry per simulated rider (leader included, as an ordinary rider), for
// the k6 script to load via `open()` and assign one-per-VU.
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... \
//     node loadtest/seed.mjs --rides 25 --members 30
//
// Defaults match the dry-run shape (small); pass --rides/--members for the
// full ~20-50-rides x ~20-50-members shape the roadmap calls for.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!ANON_KEY) {
  console.error("SUPABASE_ANON_KEY env var is required (see `npx supabase status`).");
  process.exit(1);
}

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return Number(process.argv[i + 1]);
}

const RIDE_COUNT = argNum("--rides", 3);
const MEMBERS_PER_RIDE = argNum("--members", 10);

// Bengaluru-ish default center so positions look plausible on a map; each
// ride gets its own small offset so rides don't all overlap at one point.
const BASE_LAT = 12.9716;
const BASE_LNG = 77.5946;

async function signInGuest(displayName) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({
      data: { display_name: displayName, is_guest: true },
      gotrue_meta_security: {},
    }),
  });
  if (!res.ok) {
    throw new Error(`guest sign-in failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const accessToken = json.access_token ?? json.session?.access_token;
  const userId = json.user?.id ?? json.session?.user?.id;
  if (!accessToken || !userId) {
    throw new Error(`guest sign-in response missing token/user: ${JSON.stringify(json)}`);
  }
  return { accessToken, userId };
}

function restHeaders(accessToken) {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };
}

async function rest(path, accessToken, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: { ...restHeaders(accessToken), ...(init.headers ?? {}), Prefer: init.prefer ?? "return=representation" },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function joinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function seedRide(rideIndex) {
  const leader = await signInGuest(`loadtest-leader-${rideIndex}`);
  const code = joinCode();
  const centerLat = BASE_LAT + (Math.random() - 0.5) * 0.2;
  const centerLng = BASE_LNG + (Math.random() - 0.5) * 0.2;

  const [ride] = await rest("/rides", leader.accessToken, {
    method: "POST",
    body: JSON.stringify({
      code,
      name: `Load test ride ${rideIndex}`,
      leader_id: leader.userId,
      is_demo: true,
      member_capacity: 50,
      status: "draft",
    }),
  });

  await rest("/ride_members", leader.accessToken, {
    method: "POST",
    body: JSON.stringify({ ride_id: ride.id, user_id: leader.userId, role: "leader", status: "riding" }),
  });

  // Leader flips their own ride active (rides_update RLS: leader_id = auth.uid()).
  await rest(`/rides?id=eq.${ride.id}`, leader.accessToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
    prefer: "return=minimal",
  });

  const members = [
    { ride_id: ride.id, user_id: leader.userId, access_token: leader.accessToken, start_lat: centerLat, start_lng: centerLng },
  ];

  for (let i = 0; i < MEMBERS_PER_RIDE; i++) {
    const guest = await signInGuest(`loadtest-rider-${rideIndex}-${i}`);
    // is_demo ride: request_join_ride auto-approves + materializes membership
    // in one RPC call (0001_foundation.sql:424-450).
    await rest("/rpc/request_join_ride", guest.accessToken, {
      method: "POST",
      body: JSON.stringify({ join_code: code }),
      prefer: "return=minimal",
    });
    members.push({
      ride_id: ride.id,
      user_id: guest.userId,
      access_token: guest.accessToken,
      // Small spread (~500m) around the ride's center so movement looks
      // plausible without members colliding at one point.
      start_lat: centerLat + (Math.random() - 0.5) * 0.005,
      start_lng: centerLng + (Math.random() - 0.5) * 0.005,
    });
  }

  console.log(`  ride ${rideIndex + 1}/${RIDE_COUNT}: ${ride.id} (${members.length} members)`);
  return members;
}

async function main() {
  console.log(`Seeding ${RIDE_COUNT} rides x ~${MEMBERS_PER_RIDE + 1} members against ${SUPABASE_URL} ...`);
  const all = [];
  for (let r = 0; r < RIDE_COUNT; r++) {
    const members = await seedRide(r);
    all.push(...members);
  }
  const outPath = join(__dirname, "vus.json");
  writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`Wrote ${all.length} VU entries across ${RIDE_COUNT} rides -> ${outPath}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
