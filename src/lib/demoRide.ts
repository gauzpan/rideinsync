// Demo ride bootstrap for the Flow 3 live-ops walkthrough.
// Creates an `is_demo` ride (so joins auto-approve) with a short Bengaluru route
// (RR Nagar Police Station → Jayanna Circle) baked in as a fallback path.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { LatLng } from "./geo";

type Client = SupabaseClient<Database>;

// Approximate road path through RR Nagar, Bengaluru. Coordinates are a stand-in
// used to drive the simulator; swap for a live Google Directions result later.
export const DEMO_ROUTE: LatLng[] = [
  { lat: 12.9246, lng: 77.5190 }, // RR Nagar Police Station (approx)
  { lat: 12.9235, lng: 77.5228 },
  { lat: 12.9212, lng: 77.5262 },
  { lat: 12.9188, lng: 77.5297 },
  { lat: 12.9162, lng: 77.5331 },
  { lat: 12.9141, lng: 77.5366 },
  { lat: 12.9122, lng: 77.5397 },
  { lat: 12.9106, lng: 77.5421 }, // Jayanna Circle (approx)
];

export const DEMO_START = DEMO_ROUTE[0];
export const DEMO_END = DEMO_ROUTE[DEMO_ROUTE.length - 1];

/** Names for the simulated pack (your phone joins as an extra, real rider). */
export const SIM_RIDER_NAMES = [
  "Arjun",
  "Meera",
  "Vikram",
  "Priya",
  "Rohit",
  "Kavya",
  "Sameer",
  "Divya",
];

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export type DemoRide = { rideId: string; code: string };

/**
 * Create a fresh demo ride owned by `leaderId` and register that user as its
 * leader member. A new random code each run avoids collisions and lets the
 * phone scan the current ride.
 */
export async function createDemoRide(
  client: Client,
  leaderId: string,
): Promise<DemoRide> {
  const code = randomCode();
  const { data: ride, error } = await client
    .from("rides")
    .insert({
      code,
      name: "RR Nagar → Jayanna Circle (demo)",
      leader_id: leaderId,
      city: "Bengaluru",
      start_point: { ...DEMO_START, label: "RR Nagar Police Station" },
      destination: { ...DEMO_END, label: "Jayanna Circle" },
      route: DEMO_ROUTE,
      status: "active",
      is_demo: true,
      gps_interval_seconds: 3,
    })
    .select("id")
    .single();
  if (error) throw error;

  const rideId = ride.id;
  const { error: memberErr } = await client.from("ride_members").insert({
    ride_id: rideId,
    user_id: leaderId,
    role: "leader",
    status: "riding",
  });
  if (memberErr) throw memberErr;

  return { rideId, code };
}
