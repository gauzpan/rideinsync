// Groups (ride_groups / ride_group_members) — persistent crews that plan rides
// together repeatedly. Thin wrappers per decision D18: pages never call
// supabase directly. Mirrors supabase/migrations/0011_groups.sql.
import { supabase } from "../lib/supabase";
import type {
  GroupMemberRole,
  RideGroup,
  RideGroupMember,
  Profile,
} from "../lib/models";

/** A roster row: membership plus the rider's display profile. */
export type GroupMemberWithProfile = RideGroupMember & {
  profile: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
};

export type CreateGroupInput = {
  name: string;
  city: string;
  culture: string;
  tagline: string;
  rules: string;
  /** Profile ids of additional leads (the creator is always a lead). */
  coLeads: string[];
};

/** Creates the group + creator-as-lead + co-leads atomically (RPC). Returns
 *  the new group id. */
export async function createGroup(input: CreateGroupInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_ride_group", {
    p_name: input.name,
    p_city: input.city,
    p_culture: input.culture,
    p_tagline: input.tagline,
    p_rules: input.rules,
    p_co_leads: input.coLeads,
  });
  if (error) throw error;
  return data;
}

export async function getGroupById(groupId: string): Promise<RideGroup | null> {
  const { data, error } = await supabase.from("ride_groups").select("*").eq("id", groupId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Every group the user belongs to, with their role in it. */
export async function listMyGroups(userId: string) {
  // No embed: the hand-authored database.types.ts carries Relationships: [] for
  // every table, so a nested select can't resolve. Two queries + client join.
  const { data: memberships, error } = await supabase
    .from("ride_group_members")
    .select("role, group_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  if (error) throw error;
  const groups = await groupsByIds((memberships ?? []).map((m) => m.group_id));
  return (memberships ?? [])
    .map((m) => ({ role: m.role as GroupMemberRole, group: groups.get(m.group_id) }))
    .filter((r): r is { role: GroupMemberRole; group: RideGroup } => r.group != null);
}

async function groupsByIds(ids: string[]): Promise<Map<string, RideGroup>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("ride_groups").select("*").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((g) => [g.id, g as RideGroup]));
}

/** Group detail + roster with display profiles (two queries + client join —
 *  same Relationships: [] limitation as listMyGroups). */
export async function getGroupDetail(groupId: string) {
  const [{ data: group, error: groupError }, { data: members, error: membersError }] =
    await Promise.all([
      supabase.from("ride_groups").select("*").eq("id", groupId).single(),
      supabase
        .from("ride_group_members")
        .select("*")
        .eq("group_id", groupId)
        .order("joined_at"),
    ]);
  if (groupError) throw groupError;
  if (membersError) throw membersError;
  const rows = (members ?? []) as RideGroupMember[];
  const ids = rows.map((m) => m.user_id);
  let profiles: Map<string, Pick<Profile, "id" | "display_name" | "avatar_url">> = new Map();
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);
    if (error) throw error;
    profiles = new Map((data ?? []).map((p) => [p.id, p]));
  }
  return {
    group: group as RideGroup,
    members: rows.map((m) => ({
      ...m,
      profile: profiles.get(m.user_id) ?? null,
    })),
  };
}

/** Name search for adding members/co-leads (SECURITY DEFINER seam — profiles
 *  RLS otherwise only exposes your own row). */
export async function searchRiders(query: string) {
  const { data, error } = await supabase.rpc("search_riders", { p_query: query });
  if (error) throw error;
  return data ?? [];
}

/** Lead-only: add a rider to the group as a plain member. */
export async function addGroupMember(groupId: string, userId: string) {
  const { error } = await supabase
    .from("ride_group_members")
    .insert({ group_id: groupId, user_id: userId });
  if (error) throw error;
}

/** Lead-only (or self-leave): remove a member from the group. */
export async function removeGroupMember(groupId: string, userId: string) {
  const { error } = await supabase
    .from("ride_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Lead-only: promote/demote between member and lead. */
export async function setGroupMemberRole(groupId: string, userId: string, role: GroupMemberRole) {
  const { error } = await supabase
    .from("ride_group_members")
    .update({ role })
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** The deep-link shared from the invite screen (/groups/join/:code) — same
 *  shape as rides' buildJoinUrl. Opening it while signed out routes through
 *  sign-in (or app install) first; signed in, it joins immediately. */
export function buildGroupInviteUrl(code: string): string {
  return `${window.location.origin}/groups/join/${code}`;
}

/** Joins the signed-in user into the group behind an invite code, as a plain
 *  member. Returns the group id. Throws "invalid invite code" for an unknown
 *  code (see join_group_by_code, supabase/migrations/0012_group_invite.sql). */
export async function joinGroupByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_group_by_code", { p_code: code });
  if (error) throw error;
  return data;
}
