-- ============================================================================
-- Flow 1 (Onboarding) — ticket 03: rider join + ride preview.
-- ----------------------------------------------------------------------------
-- Additive only: adds one SECURITY DEFINER function. Does not ALTER any
-- existing table (see docs/DATA_MODEL.md — rides/ride_members are seam
-- tables Flow 1 only reads).
--
-- Why: `rides_select` RLS only allows a member or the leader to read a ride
-- row. A rider typing a join code is neither yet, so there is no way for the
-- client to preview the ride (name, lead, route, capacity) before joining.
-- This mirrors the pattern already used for request_join_ride /
-- approve_join_request: a narrow, read-only SECURITY DEFINER RPC instead of
-- loosening the table's RLS policy.
-- ============================================================================

create or replace function get_ride_preview(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  r   rides%rowtype;
  out jsonb;
begin
  select * into r from rides where code = upper(p_code) and status <> 'ended';
  if r.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'ride_id', r.id,
    'code', r.code,
    'name', r.name,
    'status', r.status,
    'is_demo', r.is_demo,
    'created_at', r.created_at,
    'leader_name', (select p.display_name from profiles p where p.id = r.leader_id),
    'start_label', r.start_point ->> 'label',
    'destination_label', r.destination ->> 'label',
    'guidelines', r.guidelines,
    'member_capacity', r.member_capacity,
    'member_count', (select count(*)::int from ride_members m where m.ride_id = r.id),
    'stop_labels', coalesce(
      (select jsonb_agg(rs.name order by rs.seq) from route_stops rs where rs.ride_id = r.id),
      '[]'::jsonb
    ),
    'already_member', exists(
      select 1 from ride_members m where m.ride_id = r.id and m.user_id = auth.uid()
    )
  ) into out;

  return out;
end;
$$;

comment on function get_ride_preview(text) is
  'Read-only ride preview for the join-by-code flow. Returns null if the code does not match a joinable (non-ended) ride. SECURITY DEFINER so a non-member can preview before request_join_ride creates their membership/request.';
