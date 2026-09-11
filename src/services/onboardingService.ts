// Flow 1 (Onboarding) service seam — wraps the Supabase queries + RPCs a
// screen needs, so components never build query shapes inline. Tests for
// this flow should go through here (see docs/flow1-onboarding-spec.md).
import { supabase } from "../lib/supabase";
import type { Profile, Ride, RideInsert, RideMember, RouteStop } from "../lib/models";

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

// ---------------------------------------------------------------------------
// Ticket 03 — rider joins by code and lands on ride detail
// ---------------------------------------------------------------------------

/** Read-only ride preview shown before a rider commits to joining — shaped by
 *  the `get_ride_preview` RPC (supabase/migrations/0002_flow1_ride_preview.sql),
 *  which reads past the `rides_select` RLS policy since a non-member can't
 *  select the row directly. */
export type RidePreview = {
  rideId: string;
  code: string;
  name: string;
  status: Ride["status"];
  isDemo: boolean;
  createdAt: string;
  leaderName: string | null;
  startLabel: string | null;
  destinationLabel: string | null;
  guidelines: string | null;
  memberCapacity: number | null;
  memberCount: number;
  stopLabels: string[];
  /** True if the current user already has a `ride_members` row for this ride. */
  alreadyMember: boolean;
};

type RidePreviewJson = {
  ride_id: string;
  code: string;
  name: string;
  status: Ride["status"];
  is_demo: boolean;
  created_at: string;
  leader_name: string | null;
  start_label: string | null;
  destination_label: string | null;
  guidelines: string | null;
  member_capacity: number | null;
  member_count: number;
  stop_labels: string[];
  already_member: boolean;
};

/** Looks up a ride by its join code. Returns null for an unknown/ended code —
 *  callers show "invalid or ended code" rather than throwing. */
export async function getRidePreview(code: string): Promise<RidePreview | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc("get_ride_preview", { p_code: trimmed });
  if (error) throw error;
  if (!data) return null;
  const j = data as unknown as RidePreviewJson;
  return {
    rideId: j.ride_id,
    code: j.code,
    name: j.name,
    status: j.status,
    isDemo: j.is_demo,
    createdAt: j.created_at,
    leaderName: j.leader_name,
    startLabel: j.start_label,
    destinationLabel: j.destination_label,
    guidelines: j.guidelines,
    memberCapacity: j.member_capacity,
    memberCount: j.member_count,
    stopLabels: j.stop_labels ?? [],
    alreadyMember: j.already_member,
  };
}

/** The minimum rider profile fields gated at join time (per the spec's
 *  progressive-profiling decision): display name, one emergency contact,
 *  vehicle registration number. */
export type MinimumProfileStatus = {
  displayName: string;
  hasEmergencyContact: boolean;
  emergencyContactName: string;
  emergencyContactPhone: string;
  hasVehicle: boolean;
  vehiclePlate: string;
  /** True once all three minimum fields are present — a returning rider. */
  isComplete: boolean;
};

/** Fetches what's already on file for the signed-in user, so a returning
 *  rider's join form is prefilled/skippable instead of asked again. */
export async function getMinimumProfileStatus(userId: string): Promise<MinimumProfileStatus> {
  const [{ data: profile, error: profileError }, { data: contact, error: contactError }, { data: vehicle, error: vehicleError }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("emergency_contacts").select("*").eq("user_id", userId).eq("ordinal", 1).maybeSingle(),
      supabase.from("vehicles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
  if (profileError) throw profileError;
  if (contactError) throw contactError;
  if (vehicleError) throw vehicleError;

  const displayName = profile?.display_name && profile.display_name !== "Rider" ? profile.display_name : "";
  const hasEmergencyContact = !!contact;
  const hasVehicle = !!vehicle?.plate;
  return {
    displayName,
    hasEmergencyContact,
    emergencyContactName: contact?.name ?? "",
    emergencyContactPhone: contact?.phone ?? "",
    hasVehicle,
    vehiclePlate: vehicle?.plate ?? "",
    isComplete: !!displayName && hasEmergencyContact && hasVehicle,
  };
}

export type MinimumProfileInput = {
  displayName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  vehiclePlate: string;
};

/** Writes whatever minimum-profile fields the rider filled in. This is a soft
 *  gate for the demo (see docs/flow1-onboarding-spec.md): each field is
 *  written only if non-empty, so a partial/skipped submission never fails —
 *  callers show a warning instead of blocking. */
export async function submitMinimumProfile(userId: string, input: MinimumProfileInput): Promise<void> {
  const displayName = input.displayName.trim();
  const contactName = input.emergencyContactName.trim();
  const contactPhone = input.emergencyContactPhone.trim();
  const plate = input.vehiclePlate.trim();

  if (displayName) {
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", userId);
    if (error) throw error;
  }

  if (contactName && contactPhone) {
    const { error } = await supabase
      .from("emergency_contacts")
      .upsert(
        { user_id: userId, ordinal: 1, name: contactName, phone: contactPhone },
        { onConflict: "user_id,ordinal" }
      );
    if (error) throw error;
  }

  if (plate) {
    const { data: existing, error: findError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      const { error } = await supabase.from("vehicles").update({ plate }).eq("id", existing.id);
      if (error) throw error;
    } else {
      // make_model is not-null in the schema; registration number is the only
      // required field at join time, so a placeholder holds this row open for
      // make/model/colour to be completed later (Flow 2 profile editing).
      const { error } = await supabase
        .from("vehicles")
        .insert({ user_id: userId, make_model: "Not specified yet", plate });
      if (error) throw error;
    }
  }
}

/** Runs `request_join_ride(code)` and returns the resulting membership +
 *  ride. Demo rides auto-approve and materialise the `ride_members` row
 *  synchronously (see the RPC in 0001_foundation.sql); a non-demo ride
 *  leaves the rider pending until the lead approves (ticket 05), in which
 *  case `member` is null. Idempotent — calling it again for an existing
 *  member/request is a no-op on the DB side. */
export async function joinRideByCode(
  code: string,
  userId: string
): Promise<{ ride: Ride; member: RideMember | null }> {
  const trimmed = code.trim();
  if (!trimmed) throw new Error("Enter a join code.");

  const { error: rpcError } = await supabase.rpc("request_join_ride", { join_code: trimmed });
  if (rpcError) throw rpcError;

  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select("*")
    .eq("code", trimmed.toUpperCase())
    .maybeSingle();
  if (rideError) throw rideError;
  if (!ride) throw new Error("Couldn't load the ride after joining. Try again.");

  const { data: member, error: memberError } = await supabase
    .from("ride_members")
    .select("*")
    .eq("ride_id", ride.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw memberError;

  return { ride, member };
}

/** Everything the ride-detail screen needs: the ride, its ordered stops, and
 *  the roster (membership rows + matching profiles). Only readable once the
 *  caller is a member (RLS) — the join flow above guarantees that for a demo
 *  ride before navigating here. */
export type RideDetail = {
  ride: Ride;
  stops: RouteStop[];
  roster: { member: RideMember; profile: Profile | null }[];
};

export async function getRideDetail(rideId: string): Promise<RideDetail | null> {
  const [{ data: ride, error: rideError }, { data: stops, error: stopsError }, { data: members, error: membersError }] =
    await Promise.all([
      supabase.from("rides").select("*").eq("id", rideId).maybeSingle(),
      supabase.from("route_stops").select("*").eq("ride_id", rideId).order("seq", { ascending: true }),
      supabase.from("ride_members").select("*").eq("ride_id", rideId).order("joined_at", { ascending: true }),
    ]);
  if (rideError) throw rideError;
  if (stopsError) throw stopsError;
  if (membersError) throw membersError;
  if (!ride) return null;

  const memberRows = members ?? [];
  const userIds = memberRows.map((m) => m.user_id);
  let profiles: Profile[] = [];
  if (userIds.length > 0) {
    const { data, error } = await supabase.from("profiles").select("*").in("id", userIds);
    if (error) throw error;
    profiles = data ?? [];
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return {
    ride,
    stops: stops ?? [],
    roster: memberRows.map((member) => ({ member, profile: profileById.get(member.user_id) ?? null })),
  };
}
