// Flow 1 (Onboarding) service seam — wraps the Supabase queries + RPCs a
// screen needs, so components never build query shapes inline. Tests for
// this flow should go through here (see docs/flow1-onboarding-spec.md).
import { supabase } from "../lib/supabase";
import type {
  Document,
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
} from "../lib/models";

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
  /** Exact coordinates when the label was picked via Places autocomplete. */
  startPoint?: { lat: number; lng: number } | null;
  destinationPoint?: { lat: number; lng: number } | null;
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
    start_point: { label: startLabel, ...(input.startPoint ?? {}) },
    destination: { label: destinationLabel, ...(input.destinationPoint ?? {}) },
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
  /** Whether the current consent version has already been granted — see
   *  `grantConsent`/`CONSENT_VERSION` below. */
  hasConsent: boolean;
  /** True once all three minimum fields are present — a returning rider. */
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
    hasConsent,
    isComplete: !!displayName && hasEmergencyContact && hasVehicle && hasConsent,
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
};

/** Everything the rich-profile screen shows: the latest vehicle row (created
 *  at minimum-join with just a plate — see `submitMinimumProfile`), the
 *  medical profile, the avatar URL, and the most recent driving-licence
 *  document. All owner-only reads. */
export type RichProfile = {
  avatarUrl: string | null;
  vehicle: Vehicle | null;
  medical: MedicalProfile | null;
  licence: Document | null;
};

export async function getRichProfile(userId: string): Promise<RichProfile> {
  const [
    { data: profile, error: profileError },
    { data: vehicle, error: vehicleError },
    { data: medical, error: medicalError },
    { data: licenceRows, error: licenceError },
  ] = await Promise.all([
    supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
    supabase.from("vehicles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
  if (medicalError) throw medicalError;
  if (licenceError) throw licenceError;

  return {
    avatarUrl: profile?.avatar_url ?? null,
    vehicle: vehicle ?? null,
    medical: medical ?? null,
    licence: licenceRows?.[0] ?? null,
  };
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

/** Fills in make/model/colour on top of the registration number captured at
 *  join (`submitMinimumProfile`). Updates the rider's most recent vehicle
 *  row if one exists, otherwise creates one — mirrors the plate-only path. */
export async function submitVehicleDetails(userId: string, input: VehicleDetailsInput): Promise<void> {
  const makeModel = input.makeModel.trim();
  const color = input.color.trim();
  if (!makeModel && !color) return;

  const { data: existing, error: findError } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("vehicles")
      .update({
        ...(makeModel ? { make_model: makeModel } : {}),
        ...(color ? { color } : {}),
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("vehicles").insert({
      user_id: userId,
      make_model: makeModel || "Not specified yet",
      color: color || null,
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
