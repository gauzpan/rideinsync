-- ============================================================================
-- Flow 2 — Enforce ride capacity server-side
-- ----------------------------------------------------------------------------
-- 1. approve_join_request: locks the ride row (FOR UPDATE) to serialize concurrent
--    approvals. Rejects if capacity is reached.
-- 2. request_join_ride: early gate check rejecting non-demo joins if capacity is reached.
-- ============================================================================

create or replace function approve_join_request(request_id uuid)
returns uuid                                   -- returns ride_id
language plpgsql security definer set search_path = public as $$
declare
  req       ride_join_requests%rowtype;
  cap       int;
  demo_flag boolean;
begin
  select * into req from ride_join_requests where id = request_id;
  if req.id is null then raise exception 'no such request'; end if;
  if not is_ride_leader(req.ride_id) then raise exception 'not authorized'; end if;

  -- Lock the ride row to serialize concurrent approvals
  select member_capacity, is_demo into cap, demo_flag
  from rides
  where id = req.ride_id
  for update;

  if not coalesce(demo_flag, false) and cap is not null and (
    select count(*) from ride_members where ride_id = req.ride_id
  ) >= cap then
    raise exception 'This ride is full.';
  end if;

  update ride_join_requests
    set status = 'approved', decided_at = now(), decided_by = auth.uid()
    where id = request_id;

  insert into ride_members (ride_id, user_id, role, status)
  values (req.ride_id, req.user_id, 'rider', 'riding')
  on conflict (ride_id, user_id) do nothing;

  return req.ride_id;
end;
$$;

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

  -- Early capacity gate for non-demo rides
  if not r.is_demo and r.member_capacity is not null and (
    select count(*) from ride_members where ride_id = r.id
  ) >= r.member_capacity then
    raise exception 'This ride is full.';
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
