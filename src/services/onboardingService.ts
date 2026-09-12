// Flow 1 (Onboarding) service seam — wraps the Supabase queries + RPCs a
// screen needs, so components never build query shapes inline. Tests for
// this flow should go through here (see docs/flow1-onboarding-spec.md).
import { supabase } from "../lib/supabase";
import { demoHomeData } from "../hooks/useHomeData";
import type {
  AgeBand,
  Document,
  EmergencyContact,
  Gender,
  JoinRequestStatus,
  MedicalProfile,
  MemberRole,
  PillionLink,
  Profile,
  Ride,
  RideInsert,
  RideMember,
  RouteStop,
  Vehicle,
  PlacePoint,
} from "../lib/models";

import type { IconName } from "../components/ui/Icon";

export type { PlacePoint };

export type StopKind = "fuel" | "food" | "rest" | "scenic";

export const STOP_KINDS: StopKind[] = ["fuel", "food", "rest", "scenic"];

export const STOP_LABELS: Record<StopKind, string> = {
  fuel: "Fuel",
  food: "Food",
  rest: "Rest",
  scenic: "Scenic",
};

export const STOP_ICONS: Record<StopKind, IconName> = {
  fuel: "fuel",
  food: "food",
  rest: "rest",
  scenic: "scenic",
};

export type CreateRideStopInput = {
  kind: StopKind;
  label: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  point?: PlacePoint | null;
};

export type CreateRideInput = {
  name: string;
  /** Scheduled departure date-time (ISO string) */
  scheduledStart: string;
  /** Optional scheduled end date-time (ISO string | null) */
  scheduledEnd?: string | null;
  /** Full point (lat/lng/placeId/label) or plain label */
  start?: PlacePoint | string;
  destination?: PlacePoint | string;
  /** For backwards compatibility */
  startLabel?: string;
  destinationLabel?: string;
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

function extractPoint(
  pointOrString?: PlacePoint | string | null,
  fallbackLabel?: string
): PlacePoint | null {
  if (pointOrString && typeof pointOrString === "object") {
    const label = pointOrString.label?.trim() ?? "";
    if (!label) return null;
    return {
      label,
      ...(typeof pointOrString.lat === "number" && typeof pointOrString.lng === "number"
        ? { lat: pointOrString.lat, lng: pointOrString.lng }
        : {}),
      ...(pointOrString.placeId ? { placeId: pointOrString.placeId } : {}),
    };
  }
  const str = (typeof pointOrString === "string" ? pointOrString : fallbackLabel)?.trim();
  if (!str) return null;
  return { label: str };
}

function toLocationJson(pt: PlacePoint): {
  label: string;
  lat?: number;
  lng?: number;
  placeId?: string;
} {
  const loc: { label: string; lat?: number; lng?: number; placeId?: string } = {
    label: pt.label,
  };
  if (typeof pt.lat === "number" && typeof pt.lng === "number") {
    loc.lat = pt.lat;
    loc.lng = pt.lng;
  }
  if (pt.placeId) {
    loc.placeId = pt.placeId;
  }
  return loc;
}

/** Parses stored jsonb location back into a typed PlacePoint */
export function parseJsonPoint(json: unknown): PlacePoint | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as { label?: string; lat?: number; lng?: number; placeId?: string };
  const label = typeof obj.label === "string" ? obj.label.trim() : "";
  if (!label) return null;
  return {
    label,
    ...(typeof obj.lat === "number" && typeof obj.lng === "number" ? { lat: obj.lat, lng: obj.lng } : {}),
    ...(typeof obj.placeId === "string" && obj.placeId ? { placeId: obj.placeId } : {}),
  };
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
  const startPt = extractPoint(input.start, input.startLabel);
  const destPt = extractPoint(input.destination, input.destinationLabel);
  if (!name) throw new Error("Ride name is required.");
  if (!input.scheduledStart) throw new Error("Departure date and time is required.");
  if (!startPt || !startPt.label) throw new Error("Start point is required.");
  if (!destPt || !destPt.label) throw new Error("Destination is required.");

  const base: Omit<RideInsert, "code"> = {
    name,
    leader_id: leaderId,
    scheduled_start: input.scheduledStart,
    scheduled_end: input.scheduledEnd ?? null,
    start_point: toLocationJson(startPt),
    destination: toLocationJson(destPt),
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

  const stops = input.stops
    .map((stop) => {
      const pt = extractPoint(stop.point, stop.label);
      if (!pt || !pt.label) return null;
      return {
        kind: stop.kind,
        ...pt,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (stops.length > 0) {
    const { error: stopsError } = await supabase.from("route_stops").insert(
      stops.map((stop, idx) => ({
        ride_id: ride!.id,
        seq: idx + 1,
        name: stop.label,
        location: toLocationJson(stop),
        kind: stop.kind,
      }))
    );
    if (stopsError) throw stopsError;
  }

  return ride;
}

export type UpdateRideInput = CreateRideInput;

/**
 * Updates a draft ride's details (name, start point, destination, stops, capacity,
 * guidelines, permits, fee).
 *
 * Guarded: only the ride's leader can update it, and only while the ride is still
 * in "draft" status. Join code, leader_id, status, members, and created_at remain untouched.
 * Route stops are replaced wholesale to reflect the edited list and order.
 */
export async function updateRide(
  rideId: string,
  input: CreateRideInput,
  leaderId?: string
): Promise<Ride> {
  const { data: ride, error: fetchError } = await supabase
    .from("rides")
    .select("*")
    .eq("id", rideId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!ride) throw new Error("Ride not found.");

  const currentUserId = leaderId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!currentUserId || ride.leader_id !== currentUserId) {
    throw new Error("Only the ride's leader can edit this ride.");
  }
  if (ride.status !== "draft") {
    throw new Error("Only draft rides can be edited.");
  }

  const name = input.name.trim();
  const startPt = extractPoint(input.start, input.startLabel);
  const destPt = extractPoint(input.destination, input.destinationLabel);
  if (!name) throw new Error("Ride name is required.");
  if (!input.scheduledStart) throw new Error("Departure date and time is required.");
  if (!startPt || !startPt.label) throw new Error("Start point is required.");
  if (!destPt || !destPt.label) throw new Error("Destination is required.");

  const updatePayload: {
    name: string;
    scheduled_start: string;
    scheduled_end: string | null;
    start_point: ReturnType<typeof toLocationJson>;
    destination: ReturnType<typeof toLocationJson>;
    guidelines: string | null;
    permits: { note: string } | null;
    member_capacity: number | null;
    fee_amount: number | null;
  } = {
    name,
    scheduled_start: input.scheduledStart,
    scheduled_end: input.scheduledEnd ?? null,
    start_point: toLocationJson(startPt),
    destination: toLocationJson(destPt),
    guidelines: input.guidelines?.trim() || null,
    permits: input.permits?.trim() ? { note: input.permits.trim() } : null,
    member_capacity: input.memberCapacity ?? null,
    fee_amount: input.feeAmount ?? null,
  };

  const { data: updatedRide, error: updateError } = await supabase
    .from("rides")
    .update(updatePayload)
    .eq("id", rideId)
    .select()
    .single();

  if (updateError) throw updateError;

  // Stops = REPLACE-ALL: delete existing route_stops for this ride, then insert the edited list
  const { error: deleteStopsError } = await supabase
    .from("route_stops")
    .delete()
    .eq("ride_id", rideId);

  if (deleteStopsError) throw deleteStopsError;

  const stops = input.stops
    .map((stop) => {
      const pt = extractPoint(stop.point, stop.label);
      if (!pt || !pt.label) return null;
      return {
        kind: stop.kind,
        ...pt,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (stops.length > 0) {
    const { error: stopsError } = await supabase.from("route_stops").insert(
      stops.map((stop, idx) => ({
        ride_id: rideId,
        seq: idx + 1,
        name: stop.label,
        location: toLocationJson(stop),
        kind: stop.kind,
      }))
    );
    if (stopsError) throw stopsError;
  }

  return updatedRide;
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

/** Pulls a join code out of scanned/decoded QR text — either a full join URL
 *  (native-camera and in-app-scanner paths both encode `buildJoinUrl`'s
 *  shape) or a bare code. Returns null for anything else, so callers can
 *  show "that's not a RideInSync invite" instead of looking up garbage. */
export function extractJoinCode(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/join\/([^/]+)/);
    return match ? decodeURIComponent(match[1]).toUpperCase() : null;
  } catch {
    // Not a URL — accept it as a bare code if it looks like one.
    return /^[A-Za-z0-9]{4,12}$/.test(trimmed) ? trimmed.toUpperCase() : null;
  }
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
  scheduledStart: string | null;
  scheduledEnd: string | null;
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
  scheduled_start: string | null;
  scheduled_end: string | null;
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
    scheduledStart: j.scheduled_start,
    scheduledEnd: j.scheduled_end,
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

/**
 * Derives the public display name from first and optional last name.
 * Returns `First L.` when a last name exists, else `First`.
 */
export function deriveDisplayName(firstName: string, lastName?: string | null): string {
  const f = firstName.trim();
  const l = lastName?.trim();
  if (f && l) {
    return `${f} ${l.charAt(0).toUpperCase()}.`;
  }
  return f;
}

/** The minimum rider profile fields gated at join time (per the spec's
 *  progressive-profiling decision): first name, one emergency contact,
 *  vehicle registration number (last name optional). */
export type MinimumProfileStatus = {
  firstName: string;
  lastName: string;
  displayName: string;
  hasEmergencyContact: boolean;
  emergencyContactName: string;
  emergencyContactPhone: string;
  hasVehicle: boolean;
  vehiclePlate: string;
  /** Whether the current consent version has already been granted — see
   *  `grantConsent`/`CONSENT_VERSION` below. */
  hasConsent: boolean;
  /** True once all minimum fields are present (first name present, emergency contact, vehicle, consent). */
  isComplete: boolean;
};

/** Fetches what's already on file for the signed-in user, so a returning
 *  rider's join form is prefilled/skippable instead of asked again. */
export async function getMinimumProfileStatus(userId: string): Promise<MinimumProfileStatus> {
  const [
    { data: profile, error: profileError },
    { data: contact, error: contactError },
    { data: vehicle, error: vehicleError },
    hasConsent,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("emergency_contacts").select("*").eq("user_id", userId).eq("ordinal", 1).maybeSingle(),
    supabase.from("vehicles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    hasGrantedConsent(userId),
  ]);
  if (profileError) throw profileError;
  if (contactError) throw contactError;
  if (vehicleError) throw vehicleError;

  const firstName = profile?.first_name?.trim() ?? "";
  const lastName = profile?.last_name?.trim() ?? "";
  const displayName = profile?.display_name && profile.display_name !== "Rider" ? profile.display_name : "";
  const hasEmergencyContact = !!contact;
  const hasVehicle = !!vehicle?.plate;
  return {
    firstName,
    lastName,
    displayName,
    hasEmergencyContact,
    emergencyContactName: contact?.name ?? "",
    emergencyContactPhone: contact?.phone ?? "",
    hasVehicle,
    vehiclePlate: vehicle?.plate ?? "",
    hasConsent,
    isComplete: !!firstName && hasEmergencyContact && hasVehicle && hasConsent,
  };
}

// ---------------------------------------------------------------------------
// Ticket 07 — consent, guest→lead upgrade, join edge cases
// ---------------------------------------------------------------------------

/** Bump this when the T&C/DPDP copy changes materially — a new version means
 *  every user is asked to re-consent once (full policy copy is out of scope
 *  for this build; see docs/flow1-onboarding-spec.md). */
const CONSENT_VERSION = "2026-09-v1";
const CONSENT_POLICIES = ["dpdp", "tnc"] as const;

/** True once the user has granted the current consent version for every
 *  policy the single checkbox covers (DPDP + T&Cs). */
export async function hasGrantedConsent(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("consent_records")
    .select("policy")
    .eq("user_id", userId)
    .eq("version", CONSENT_VERSION);
  if (error) throw error;
  const granted = new Set((data ?? []).map((r) => r.policy));
  return CONSENT_POLICIES.every((p) => granted.has(p));
}

/** Records the single consent checkbox as one `consent_records` row per
 *  policy it covers. Upsert so re-checking an already-granted version is a
 *  no-op rather than a unique-constraint error. */
export async function grantConsent(userId: string): Promise<void> {
  const { error } = await supabase
    .from("consent_records")
    .upsert(
      CONSENT_POLICIES.map((policy) => ({ user_id: userId, policy, version: CONSENT_VERSION })),
      { onConflict: "user_id,policy,version" }
    );
  if (error) throw error;
}

/** Withdraws a still-pending join request (own row only — enforced by
 *  `join_requests_delete_self_pending` RLS in 0006_flow1_consent_edge_cases.sql).
 *  Approved/rejected requests are left in place as an audit trail. */
export async function withdrawJoinRequest(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("ride_join_requests")
    .delete()
    .eq("ride_id", rideId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
}

/** Lets a member leave a ride they joined before it starts, by deleting
 *  their own `ride_members` row (`ride_members_write_self` RLS in
 *  0001_foundation.sql already permits this — no new policy needed). Also
 *  clears a pillion's own link, if any, so it doesn't dangle. Mid-ride
 *  leaving (`member_status = 'leaving'`) is Flow 3/4 territory, out of scope
 *  here — callers should only offer this while `ride.status === 'draft'`. */
export async function leaveRide(rideId: string, userId: string): Promise<void> {
  const { error: linkError } = await supabase
    .from("ride_pillion_links")
    .delete()
    .eq("ride_id", rideId)
    .eq("pillion_user_id", userId);
  if (linkError) throw linkError;

  const { error } = await supabase.from("ride_members").delete().eq("ride_id", rideId).eq("user_id", userId);
  if (error) throw error;
}

export type MinimumProfileInput = {
  /** First/last name model (join-time flow). When present, display_name is
   *  derived as 'First L.' / 'First'. */
  firstName?: string;
  lastName?: string;
  /** Pre-derived display name (profile-edit flow that doesn't split the name). */
  displayName?: string;
  /** The rider's own phone number (distinct from the emergency contact's).
   *  Optional — join-time callers don't collect it. */
  phone?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  vehiclePlate: string;
};

/** Writes whatever minimum-profile fields the rider filled in. This is a soft
 *  gate for the demo (see docs/flow1-onboarding-spec.md): each field is
 *  written only if non-empty, so a partial/skipped submission never fails —
 *  callers show a warning instead of blocking. First name is required to complete,
 *  last name is optional. display_name is derived as 'First L.' or 'First'. */
export async function submitMinimumProfile(userId: string, input: MinimumProfileInput): Promise<void> {
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() || null;
  const displayName = input.displayName?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const contactName = input.emergencyContactName.trim();
  const contactPhone = input.emergencyContactPhone.trim();
  const plate = input.vehiclePlate.trim();

  // Accept either name model: first/last (derive display_name) or a pre-derived
  // displayName. Only the fields the caller actually supplied are written.
  const profileUpdate: {
    first_name?: string;
    last_name?: string | null;
    display_name?: string;
    phone?: string;
  } = {};
  if (firstName) {
    profileUpdate.first_name = firstName;
    profileUpdate.last_name = lastName;
    profileUpdate.display_name = deriveDisplayName(firstName, lastName);
  } else if (displayName) {
    profileUpdate.display_name = displayName;
  }
  if (phone) profileUpdate.phone = phone;

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", userId);
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
): Promise<{ rideId: string; member: RideMember | null }> {
  const trimmed = code.trim();
  if (!trimmed) throw new Error("Enter a join code.");

  const { error: rpcError } = await supabase.rpc("request_join_ride", { join_code: trimmed });
  if (rpcError) throw rpcError;

  // Get the ride id via the preview RPC (SECURITY DEFINER, readable by
  // non-members). A still-pending (non-demo) rider is not yet a member, so the
  // `rides` table is RLS-hidden from them — selecting it directly returns null
  // and used to throw "Couldn't load the ride after joining".
  const preview = await getRidePreview(trimmed);
  if (!preview) throw new Error("Couldn't load the ride after joining. Try again.");

  const { data: member, error: memberError } = await supabase
    .from("ride_members")
    .select("*")
    .eq("ride_id", preview.rideId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw memberError;

  return { rideId: preview.rideId, member: member ?? null };
}

/** Everything the ride-detail screen needs: the ride, its ordered stops, and
 *  the roster (membership rows + matching profiles). Only readable once the
 *  caller is a member (RLS) — the join flow above guarantees that for a demo
 *  ride before navigating here. */
export type RideDetail = {
  ride: Ride;
  stops: RouteStop[];
  roster: { member: RideMember; profile: Profile | null }[];
  /** ticket 06 — pillion↔rider pairings for this ride, so the roster can
   *  show a pillion grouped with the rider whose bike they're on. */
  pillionLinks: PillionLink[];
};

export async function getRideDetail(rideId: string): Promise<RideDetail | null> {
  const [
    { data: ride, error: rideError },
    { data: stops, error: stopsError },
    { data: members, error: membersError },
    { data: pillionLinks, error: pillionLinksError },
  ] = await Promise.all([
    supabase.from("rides").select("*").eq("id", rideId).maybeSingle(),
    supabase.from("route_stops").select("*").eq("ride_id", rideId).order("seq", { ascending: true }),
    supabase.from("ride_members").select("*").eq("ride_id", rideId).order("joined_at", { ascending: true }),
    supabase.from("ride_pillion_links").select("*").eq("ride_id", rideId),
  ]);
  if (rideError) throw rideError;
  if (stopsError) throw stopsError;
  if (membersError) throw membersError;
  if (pillionLinksError) throw pillionLinksError;
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
    pillionLinks: pillionLinks ?? [],
  };
}

/** Reads back the current user's own `ride_join_requests` row for a ride —
 *  lets the pending-approval screen (ticket 05) know whether they're still
 *  waiting, were approved (materialised as a `ride_members` row separately),
 *  or were declined. Own-row read only (RLS: `user_id = auth.uid()`). */
export async function getJoinRequestStatus(rideId: string, userId: string): Promise<JoinRequestStatus | null> {
  const { data, error } = await supabase
    .from("ride_join_requests")
    .select("status")
    .eq("ride_id", rideId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

// ---------------------------------------------------------------------------
// Flow 2 — "Your rides" dashboard section
// ---------------------------------------------------------------------------

/** One row for the "Your rides" list on the landing page — a ride the user
 *  is (or was) a member of, plus their role and enough of the ride to render
 *  a card without a second round-trip per ride. */
export type MyRideSummary = {
  rideId: string;
  name: string;
  status: Ride["status"];
  role: MemberRole;
  startLabel: string | null;
  destinationLabel: string | null;
  memberCount: number;
  createdAt: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
};

// Demo mode: no Supabase keys. lib/activeRide short-circuits to the seed ride
// and Home (useHomeData) renders it; the landing page's "Your rides" must match
// so `/` shows the ride card instead of hanging on "Loading your rides…".
const DEMO = import.meta.env.VITE_DEMO_SESSION === "1";

/** The one seed ride shaped as a MyRideSummary for demo mode. Reuses
 *  demoHomeData() so id/name/role/rider-count never drift from Home; start and
 *  destination labels are the seed's (supabase/seed.sql). Exported as a pure
 *  seam so it can be asserted without a live backend or env override. */
export function demoMyRides(): MyRideSummary[] {
  const { activeRide } = demoHomeData();
  const ride = activeRide!; // demoHomeData always resolves to the seed ride
  return [
    {
      rideId: ride.id,
      name: ride.name,
      status: "active",
      role: ride.role,
      startLabel: "MG Road",
      destinationLabel: "Nandi Hills",
      memberCount: ride.riderCount,
      createdAt: "2026-09-13T00:00:00.000Z",
      scheduledStart: null,
      scheduledEnd: null,
    },
  ];
}

/** Fetches the rides the user belongs to (leader or joined), newest first,
 *  for the landing page's "Your rides" section. Two round-trips: the user's
 *  own `ride_members` rows (own-row RLS, always readable), then the matching
 *  `rides` (readable via `rides_select` once membership exists) plus a
 *  member-count per ride. */
export async function getMyRides(userId: string): Promise<MyRideSummary[]> {
  if (DEMO) return demoMyRides();
  const { data: memberships, error: membersError } = await supabase
    .from("ride_members")
    .select("ride_id, role")
    .eq("user_id", userId);
  if (membersError) throw membersError;
  if (!memberships || memberships.length === 0) return [];

  const rideIds = memberships.map((m) => m.ride_id);
  const roleByRideId = new Map(memberships.map((m) => [m.ride_id, m.role]));

  const [{ data: rides, error: ridesError }, { data: allMembers, error: countError }] = await Promise.all([
    supabase.from("rides").select("*").in("id", rideIds).order("created_at", { ascending: false }),
    supabase.from("ride_members").select("ride_id").in("ride_id", rideIds),
  ]);
  if (ridesError) throw ridesError;
  if (countError) throw countError;

  const countByRideId = new Map<string, number>();
  for (const m of allMembers ?? []) {
    countByRideId.set(m.ride_id, (countByRideId.get(m.ride_id) ?? 0) + 1);
  }

  return (rides ?? []).map((ride) => ({
    rideId: ride.id,
    name: ride.name,
    status: ride.status,
    role: roleByRideId.get(ride.id) ?? "rider",
    startLabel: (ride.start_point as { label?: string } | null)?.label ?? null,
    destinationLabel: (ride.destination as { label?: string } | null)?.label ?? null,
    memberCount: countByRideId.get(ride.id) ?? 0,
    createdAt: ride.created_at,
    scheduledStart: ride.scheduled_start,
    scheduledEnd: ride.scheduled_end,
  }));
}

/** Formats an ISO string in user's local time (e.g. "Sat, Sep 12, 2:30 PM") */
export function formatScheduleDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Formats departure and optional end date-time in user's local time */
export function formatScheduleRange(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return "";
  const startStr = formatScheduleDateTime(startIso);
  if (!endIso) return startStr;
  const endDate = new Date(endIso);
  if (isNaN(endDate.getTime())) return startStr;
  const startDate = new Date(startIso);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const endStr = sameDay
    ? endDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : formatScheduleDateTime(endIso);
  return `${startStr} – ${endStr}`;
}

// ---------------------------------------------------------------------------
// Ticket 05 — lead approval, roster & role assignment
// ---------------------------------------------------------------------------

/** A pending join request enriched with what the lead needs to decide:
 *  rider name, avatar, and vehicle (per the ticket's acceptance criteria). */
export type PendingJoinRequest = {
  id: string;
  userId: string;
  requestedAt: string;
  displayName: string;
  avatarUrl: string | null;
  vehiclePlate: string | null;
  vehicleMakeModel: string | null;
};

/** Fetches the pending join requests for a ride, joined with each requester's
 *  profile and most recent vehicle. Readable by the leader/co-leader under
 *  `join_requests_select` RLS. */
export async function getPendingJoinRequests(rideId: string): Promise<PendingJoinRequest[]> {
  const { data: requests, error } = await supabase
    .from("ride_join_requests")
    .select("*")
    .eq("ride_id", rideId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  const rows = requests ?? [];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const [{ data: profiles, error: profileError }, { data: vehicles, error: vehicleError }] = await Promise.all([
    supabase.from("profiles").select("*").in("id", userIds),
    supabase.from("vehicles").select("*").in("user_id", userIds).order("created_at", { ascending: false }),
  ]);
  if (profileError) throw profileError;
  if (vehicleError) throw vehicleError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  // Vehicles are ordered newest-first above, so the first hit per user is
  // their most recent registration.
  const vehicleByUser = new Map<string, Vehicle>();
  for (const v of vehicles ?? []) {
    if (!vehicleByUser.has(v.user_id)) vehicleByUser.set(v.user_id, v);
  }

  return rows.map((r) => {
    const profile = profileById.get(r.user_id);
    const vehicle = vehicleByUser.get(r.user_id);
    return {
      id: r.id,
      userId: r.user_id,
      requestedAt: r.requested_at,
      displayName: profile?.display_name ?? "Rider",
      avatarUrl: profile?.avatar_url ?? null,
      vehiclePlate: vehicle?.plate ?? null,
      vehicleMakeModel: vehicle?.make_model ?? null,
    };
  });
}

/** Approves a pending join request, materialising the rider's `ride_members`
 *  row via the foundation's `approve_join_request` RPC (0001_foundation.sql).
 *  Callers should apply the client-side capacity guard before invoking this —
 *  the RPC itself does not enforce `member_capacity` (hard enforcement is a
 *  foundation-owned follow-up, see docs/flow1-onboarding-spec.md). */
export async function approveJoinRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("approve_join_request", { request_id: requestId });
  if (error) throw error;
}

/** Declines a pending join request via the `decline_join_request` RPC
 *  (supabase/migrations/0003_flow1_lead_approval.sql) — `ride_join_requests`
 *  has no leader UPDATE policy, only SELECT, so a plain table update would be
 *  blocked by RLS. The rider's own `getJoinRequestStatus` read reflects the
 *  decline back to them. */
export async function declineJoinRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_join_request", { p_request_id: requestId });
  if (error) throw error;
}

/** Roles a lead can hand out from the roster — reassigning the leader itself
 *  is out of scope for this ticket. */
export type AssignableRole = Extract<MemberRole, "sweep" | "co_leader" | "rider">;

/** Assigns Sweep/Co-lead (or clears a member back to Rider) via the
 *  `assign_ride_role` RPC — `ride_members_write_self` only lets a member
 *  update their own row, so cross-member role changes must go through the
 *  leader-checked RPC, which also demotes the outgoing holder of that role so
 *  the schema's one-leader/one-sweep constraint is never violated. */
export async function assignRideRole(rideId: string, userId: string, role: AssignableRole): Promise<void> {
  const { error } = await supabase.rpc("assign_ride_role", {
    p_ride_id: rideId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

/**
 * Leader removes another member from a draft ride via the `remove_ride_member` RPC.
 * Only the ride leader can perform this, only while the ride is in draft, and
 * the leader cannot be removed. Cleans up dangling pillion links and membership.
 */
export async function removeMember(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_ride_member", {
    p_ride_id: rideId,
    p_user_id: userId,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Ticket 06 — pillion join, linked to rider
// ---------------------------------------------------------------------------

export type PillionRiderOption = { userId: string; displayName: string };

/** Riders a pillion can pick as "who I'm riding with": every other member of
 *  the ride, minus anyone already recorded as somebody else's pillion (a
 *  pillion has no bike of their own to sit on) and the pillion themselves.
 *  Only readable once the pillion is a ride member (RLS `is_ride_member`),
 *  which the join flow guarantees before this is called. */
export async function getEligibleRidersForPillion(
  rideId: string,
  pillionUserId: string
): Promise<PillionRiderOption[]> {
  const [{ data: members, error: membersError }, { data: links, error: linksError }] = await Promise.all([
    supabase.from("ride_members").select("user_id").eq("ride_id", rideId),
    supabase.from("ride_pillion_links").select("pillion_user_id").eq("ride_id", rideId),
  ]);
  if (membersError) throw membersError;
  if (linksError) throw linksError;

  const pillionIds = new Set((links ?? []).map((l) => l.pillion_user_id));
  const riderIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== pillionUserId && !pillionIds.has(id));
  if (riderIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", riderIds);
  if (profileError) throw profileError;
  return (profiles ?? []).map((p) => ({ userId: p.id, displayName: p.display_name ?? "Rider" }));
}

/** The current user's own pillion link for a ride, if any — used so a
 *  returning pillion (e.g. after their approval came through) isn't asked to
 *  pick a rider twice. */
export async function getOwnPillionLink(rideId: string, pillionUserId: string): Promise<PillionLink | null> {
  const { data, error } = await supabase
    .from("ride_pillion_links")
    .select("*")
    .eq("ride_id", rideId)
    .eq("pillion_user_id", pillionUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Writes the pillion→rider pairing. Upsert (not plain insert) so re-picking
 *  a different rider replaces the row instead of hitting the
 *  `unique(ride_id, pillion_user_id)` constraint — a pillion is one bike's
 *  passenger per ride, but which bike can change before the ride starts. */
export async function linkPillionToRider(rideId: string, pillionUserId: string, riderUserId: string): Promise<void> {
  const { error } = await supabase
    .from("ride_pillion_links")
    .upsert(
      { ride_id: rideId, pillion_user_id: pillionUserId, rider_user_id: riderUserId },
      { onConflict: "ride_id,pillion_user_id" }
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Ticket 08 — rich profile: medical, driving licence, avatar, vehicle
// characteristics. All of this is optional and skippable — never gates
// joining (docs/flow1-onboarding-spec.md) — and completable here or, later,
// from the Flow 2 dashboard. Storage buckets + owner-only policies are set
// up in supabase/migrations/0005_flow1_rich_profile.sql.
// ---------------------------------------------------------------------------

export type MedicalProfileInput = {
  bloodType: string;
  allergies: string;
  medications: string;
  notes: string;
};

export type VehicleDetailsInput = {
  makeModel: string;
  color: string;
  plate?: string;
};

export type PersonalDetailsInput = {
  firstName: string;
  lastName?: string;
  gender?: Gender | null;
  ageBand?: AgeBand | null;
};

/** Everything the rich-profile screen shows: personal details (first/last name,
 *  gender, age band), the rider's own phone and derived display name, the latest
 *  vehicle row, the primary emergency contact, the medical profile, the avatar
 *  URL, and the most recent driving-licence document. All owner-only reads. */
export type RichProfile = {
  firstName: string | null;
  lastName: string | null;
  gender: Gender | null;
  ageBand: AgeBand | null;
  displayName: string;
  phone: string;
  plate: string | null;
  avatarUrl: string | null;
  vehicle: Vehicle | null;
  emergencyContact: EmergencyContact | null;
  medical: MedicalProfile | null;
  licence: Document | null;
};

export async function getRichProfile(userId: string): Promise<RichProfile> {
  const [
    { data: profile, error: profileError },
    { data: vehicle, error: vehicleError },
    { data: emergencyContact, error: contactError },
    { data: medical, error: medicalError },
    { data: licenceRows, error: licenceError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, phone, avatar_url, first_name, last_name, gender, age_band")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("vehicles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("emergency_contacts").select("*").eq("user_id", userId).eq("ordinal", 1).maybeSingle(),
    supabase.from("medical_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "license")
      .order("uploaded_at", { ascending: false })
      .limit(1),
  ]);
  if (profileError) throw profileError;
  if (vehicleError) throw vehicleError;
  if (contactError) throw contactError;
  if (medicalError) throw medicalError;
  if (licenceError) throw licenceError;

  return {
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    gender: (profile?.gender as Gender | null) ?? null,
    ageBand: (profile?.age_band as AgeBand | null) ?? null,
    displayName: profile?.display_name && profile.display_name !== "Rider" ? profile.display_name : "",
    phone: profile?.phone ?? "",
    plate: vehicle?.plate ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    vehicle: vehicle ?? null,
    emergencyContact: emergencyContact ?? null,
    medical: medical ?? null,
    licence: licenceRows?.[0] ?? null,
  };
}

/** Updates the rider's personal details (demographics) and keeps display_name derived. */
export async function submitPersonalDetails(userId: string, input: PersonalDetailsInput): Promise<void> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName?.trim() || null;
  if (!firstName) {
    throw new Error("First name is required.");
  }
  const derived = deriveDisplayName(firstName, lastName);
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      gender: input.gender ?? null,
      age_band: input.ageBand ?? null,
      display_name: derived,
    })
    .eq("id", userId);
  if (error) throw error;
}

/** Upserts the medical profile. Every field is optional — a rider can save a
 *  blood type alone, or nothing at all (callers just don't call this). */
export async function submitMedicalProfile(userId: string, input: MedicalProfileInput): Promise<void> {
  const { error } = await supabase.from("medical_profiles").upsert({
    user_id: userId,
    blood_type: input.bloodType.trim() || null,
    allergies: input.allergies.trim() || null,
    medications: input.medications.trim() || null,
    notes: input.notes.trim() || null,
  });
  if (error) throw error;
}

/** Fills in make/model/colour/plate. Updates the rider's most recent vehicle
 *  row if one exists (the row created at minimum-join with just a plate — see
 *  `submitMinimumProfile` — or an earlier full save), otherwise creates one. */
export async function submitVehicleDetails(userId: string, input: VehicleDetailsInput): Promise<void> {
  const makeModel = input.makeModel.trim();
  const color = input.color.trim();
  const plate = input.plate !== undefined ? input.plate.trim() : undefined;
  if (!makeModel && !color && (plate === undefined || !plate)) return;

  const { data: existing, error: findError } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const updatePayload: { make_model?: string; color?: string | null; plate?: string | null } = {};
    if (makeModel) updatePayload.make_model = makeModel;
    if (color !== undefined) updatePayload.color = color || null;
    if (plate !== undefined) updatePayload.plate = plate || null;

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabase.from("vehicles").update(updatePayload).eq("id", existing.id);
      if (error) throw error;
    }
  } else {
    const { error } = await supabase.from("vehicles").insert({
      user_id: userId,
      make_model: makeModel || "Not specified yet",
      color: color || null,
      plate: plate || null,
    });
    if (error) throw error;
  }
}

function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.split("/")[1] ?? "bin";
}

/** Uploads a new avatar image to the public `avatars` bucket and points
 *  `profiles.avatar_url` at it. Fixed filename (upsert) so re-uploads
 *  replace the old image instead of littering the bucket. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const path = `${userId}/avatar.${fileExtension(file)}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`; // cache-bust the CDN URL on replace

  const { error: profileError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (profileError) throw profileError;

  return url;
}

/** Uploads a driving-licence document to the private `documents` bucket and
 *  records it as a `documents` row (owner-only RLS on both the bucket and
 *  the table — see 0005_flow1_rich_profile.sql). */
export async function uploadDrivingLicence(userId: string, file: File): Promise<Document> {
  const path = `${userId}/license-${Date.now()}.${fileExtension(file)}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("documents")
    .insert({ user_id: userId, type: "license", storage_path: path })
    .select()
    .single();
  if (error) throw error;
  return data;
}
