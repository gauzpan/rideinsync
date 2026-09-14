// ============================================================================
// Domain model — the single import point for branch work.
// ----------------------------------------------------------------------------
// Row / Insert / Update aliases for every table + enum unions + a few composite
// types the UI works with. Import from here, not from database.types.ts directly:
//   import type { Ride, RideMemberInsert, RiderOnMap } from "@/lib/models";
// ============================================================================

import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Insert<T extends keyof Tables> = Tables[T]["Insert"];
export type Update<T extends keyof Tables> = Tables[T]["Update"];

// ---- Re-export enum unions --------------------------------------------------
export type {
  MemberRole,
  RideStatus,
  MemberStatus,
  EventType,
  StoppageReason,
  JoinRequestStatus,
  DocumentType,
  Visibility,
  SosKind,
  AckState,
  PitstopKind,
  ConsentPolicy,
  TravelMode,
  Gender,
  AgeBand,
  FeedbackSentiment,
  GroupMemberRole,
  Json,
} from "./database.types";

// ---- Row aliases (the shapes read back from the DB) -------------------------
export type Profile = Row<"profiles">;
export type Ride = Row<"rides">;
export type RideMember = Row<"ride_members">;
export type RiderPosition = Row<"rider_positions">;
export type RideEvent = Row<"ride_events">;
export type EventAcknowledgement = Row<"event_acknowledgements">;
export type EmergencyContact = Row<"emergency_contacts">;
export type MedicalProfile = Row<"medical_profiles">;
export type Vehicle = Row<"vehicles">;
export type Document = Row<"documents">;
export type ConsentRecord = Row<"consent_records">;
export type RouteStop = Row<"route_stops">;
export type RideJoinRequest = Row<"ride_join_requests">;
export type PillionLink = Row<"ride_pillion_links">;
export type PillionLinkInsert = Insert<"ride_pillion_links">;
export type UserStats = Row<"user_stats">;
export type Badge = Row<"badges">;
export type UserBadge = Row<"user_badges">;
export type UserPreferences = Row<"user_preferences">;
export type PrivacySettings = Row<"privacy_settings">;
export type StoppageReport = Row<"stoppage_reports">;
export type SeparationEvent = Row<"separation_events">;
export type Pitstop = Row<"pitstops">;
export type SosAlert = Row<"sos_alerts">;
export type SosResponse = Row<"sos_responses">;
export type RideSummary = Row<"ride_summaries">;
export type RideFeedback = Row<"ride_feedback">;
export type PushSubscriptionRow = Row<"push_subscriptions">;
export type RideGroup = Row<"ride_groups">;
export type RideGroupMember = Row<"ride_group_members">;
export type RideGroupMemberInsert = Insert<"ride_group_members">;

// ---- Insert aliases for the tables branches write most -----------------------
export type RideInsert = Insert<"rides">;
export type RideMemberInsert = Insert<"ride_members">;
export type RiderPositionInsert = Insert<"rider_positions">;
export type RideEventInsert = Insert<"ride_events">;
export type StoppageReportInsert = Insert<"stoppage_reports">;
export type SosAlertInsert = Insert<"sos_alerts">;
export type SosResponseInsert = Insert<"sos_responses">;
export type RideFeedbackInsert = Insert<"ride_feedback">;
export type PushSubscriptionInsert = Insert<"push_subscriptions">;

// ---- Geo helper (shape stored in start_point/destination/location jsonb) -----
export type GeoPoint = {
  label: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};
export type PlacePoint = GeoPoint;
// ---- Composite view models (derived on the client, not tables) --------------

/**
 * Group status for the lead/sweep ops view (no backing table). As of M3
 * (docs/scale-readiness-roadmap.md) this is computed server-side by the
 * broadcast aggregator, not derived on the client from raw positions.
 */
export type GroupStatus = "intact" | "behind" | "stopped" | "stale";

/**
 * A rider's latest known position as delivered by the M3 broadcast
 * aggregator's "pack" event (or the `latest_positions` seed row shape it
 * mirrors) — a narrower, table-agnostic shape than the old `rider_positions`
 * row (no `id`/PK; that table is history-only now, see M2/M3 in the
 * roadmap). `status` is only present once a broadcast has actually arrived.
 */
export type LiveRiderPosition = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
};

/** A rider as rendered on the live map: membership + latest known position. */
export type RiderOnMap = {
  member: RideMember;
  profile: Pick<Profile, "id" | "display_name" | "avatar_url">;
  latest: LiveRiderPosition | null;
  status: GroupStatus;
};
