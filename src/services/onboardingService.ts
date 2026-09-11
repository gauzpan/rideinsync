// Flow 1 (Onboarding) service seam — wraps the Supabase queries + RPCs a
// screen needs, so components never build query shapes inline. Tests for
// this flow should go through here (see docs/flow1-onboarding-spec.md).
import { supabase } from "../lib/supabase";
import type { Ride, RideInsert } from "../lib/models";

export type StopKind = "fuel" | "food" | "rest" | "scenic";

export const STOP_KINDS: StopKind[] = ["fuel", "food", "rest", "scenic"];

export type CreateRideStopInput = {
  label: string;
  kind: StopKind;
};

export type CreateRideInput = {
  name: string;
  startLabel: string;
  destinationLabel: string;
  stops: CreateRideStopInput[];
  /** null/omitted = no capacity limit set. */
  memberCapacity?: number | null;
  guidelines?: string | null;
  permits?: string | null;
  feeAmount?: number | null;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to read aloud
const CODE_LENGTH = 6;
const POSTGRES_UNIQUE_VIOLATION = "23505";
const MAX_CODE_ATTEMPTS = 5;

function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Creates a route-based ride: the `rides` row (leader = `leaderId`, status
 * `draft`, a unique generated join code), the leader's own `ride_members`
 * row, and any ordered `route_stops`. Order matters under RLS — route_stops
 * writes require `is_ride_leader()`, which reads `ride_members`, so the
 * leader membership must be inserted before the stops.
 */
export async function createRide(leaderId: string, input: CreateRideInput): Promise<Ride> {
  const name = input.name.trim();
  const startLabel = input.startLabel.trim();
  const destinationLabel = input.destinationLabel.trim();
  if (!name) throw new Error("Ride name is required.");
  if (!startLabel) throw new Error("Start point is required.");
  if (!destinationLabel) throw new Error("Destination is required.");

  const base: Omit<RideInsert, "code"> = {
    name,
    leader_id: leaderId,
    start_point: { label: startLabel },
    destination: { label: destinationLabel },
    guidelines: input.guidelines?.trim() || null,
    permits: input.permits?.trim() ? { note: input.permits.trim() } : null,
    member_capacity: input.memberCapacity ?? null,
    fee_amount: input.feeAmount ?? null,
    status: "draft",
  };

  let ride: Ride | null = null;
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !ride; attempt++) {
    const { data, error } = await supabase
      .from("rides")
      .insert({ ...base, code: generateJoinCode() })
      .select()
      .single();
    if (!error) {
      ride = data;
      break;
    }
    lastError = error;
    if (error.code !== POSTGRES_UNIQUE_VIOLATION) throw error;
  }
  if (!ride) {
    throw new Error(lastError?.message ?? "Could not generate a unique join code — try again.");
  }

  const { error: memberError } = await supabase.from("ride_members").insert({
    ride_id: ride.id,
    user_id: leaderId,
    role: "leader",
    status: "riding",
  });
  if (memberError) throw memberError;

  const stops = input.stops.filter((s) => s.label.trim().length > 0);
  if (stops.length > 0) {
    const { error: stopsError } = await supabase.from("route_stops").insert(
      stops.map((stop, idx) => ({
        ride_id: ride!.id,
        seq: idx + 1,
        name: stop.label.trim(),
        // Text-label location, per docs/flow1-onboarding-spec.md — coordinates
        // are backfilled by Flow 3's Google Maps integration.
        location: { label: stop.label.trim() },
        kind: stop.kind,
      }))
    );
    if (stopsError) throw stopsError;
  }

  return ride;
}

/** Fetches a ride by id — used by the invite screen on a hard refresh, when
 *  the freshly-created ride isn't available via router state. */
export async function getRideById(rideId: string): Promise<Ride | null> {
  const { data, error } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
  if (error) throw error;
  return data;
}

/** The deep-link a rider taps to land in the join flow with the code
 *  pre-filled (`/join/:code`, per docs/flow1-onboarding-spec.md). */
export function buildJoinUrl(code: string): string {
  return `${window.location.origin}/join/${code}`;
}
