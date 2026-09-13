-- ============================================================================
-- Flow 2 — Delete draft ride RLS & cancelled ride handling
-- ----------------------------------------------------------------------------
-- 1. Add rides_delete RLS policy allowing a leader to delete their draft ride.
-- 2. get_ride_preview: preserves code lookup for non-ended rides including
--    cancelled rides so riders can view the cancellation notice.
-- 3. request_join_ride: raises an exception when attempting to join a cancelled ride.
-- ============================================================================

-- Leader can delete their draft ride
drop policy if exists rides_delete on public.rides;
create policy rides_delete on public.rides
  for delete using (leader_id = auth.uid() and status = 'draft');

-- Read-only ride preview: returns preview for non-ended rides (draft, active, cancelled).
-- Returns null only if code does not match or ride has status = 'ended'.
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
  'Read-only ride preview for the join-by-code flow. Returns null if the code does not match or is ended. Includes cancelled rides so the client can display cancellation notice. SECURITY DEFINER so a non-member can preview before joining.';

-- Reject join requests for cancelled rides
create or replace function request_join_ride(join_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r        rides%rowtype;
  req_id   uuid;
begin
  select * into r from rides where (code = upper(join_code) or code = join_code) and status <> 'ended';
  if r.id is null then
    raise exception 'invalid or ended ride';
  end if;

  if r.status = 'cancelled' then
    raise exception 'This ride was cancelled.';
  end if;

  insert into ride_join_requests (ride_id, user_id, status)
  values (
    r.id,
    auth.uid(),
    (case when r.is_demo then 'approved' else 'pending' end)::join_request_status
  )
  on conflict (ride_id, user_id) do update set status = ride_join_requests.status
  returning id into req_id;

  -- Demo rides: materialize membership immediately for a frictionless walkthrough.
  if r.is_demo then
    insert into ride_members (ride_id, user_id, role, status)
    values (r.id, auth.uid(), 'rider', 'riding')
    on conflict (ride_id, user_id) do nothing;
  end if;

  return req_id;
end;
$$;
