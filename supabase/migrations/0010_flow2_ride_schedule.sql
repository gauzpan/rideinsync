-- ============================================================================
-- Flow 2 — Scheduled start and end date-time for rides
-- ----------------------------------------------------------------------------
-- Additive only: adds scheduled_start and scheduled_end columns to rides,
-- and updates get_ride_preview to return them in the preview jsonb.
-- No RLS changes needed: rides_update already covers the leader updating rides.
-- ============================================================================

alter table public.rides
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end   timestamptz;

-- Replaces get_ride_preview from 0002_flow1_ride_preview.sql to include
-- scheduled_start and scheduled_end while preserving all existing fields.
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
    'scheduled_start', r.scheduled_start,
    'scheduled_end', r.scheduled_end,
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
  'Read-only ride preview for the join-by-code flow. Returns null if the code does not match a joinable (non-ended) ride. Includes scheduled_start and scheduled_end. SECURITY DEFINER so a non-member can preview before request_join_ride creates their membership/request.';
