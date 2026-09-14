-- Lead raises/lowers ride capacity mid-lifecycle (draft or active).
-- ----------------------------------------------------------------------------
-- The lead-view and join screens already tell a full ride's lead to "raise the
-- capacity", but there was no write path to do it: updateRide() is draft-only
-- and the rides_update RLS policy only permits leader_id = auth.uid() (no
-- co-lead). This RPC gives leader + co-lead one narrow knob that only touches
-- member_capacity, so a full draft/active ride can admit more riders without
-- opening full ride edits mid-ride.
--
-- Guards: caller must be leader/co-lead (is_ride_leader), ride must be draft
-- or active (ended/cancelled stay immutable for summaries/feedback history),
-- capacity is null (no limit) or 1..50 (mirrors the rides CHECK), and never
-- below the current member count (can't strand existing members over-limit).

create or replace function update_ride_capacity(p_ride_id uuid, p_capacity int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r            rides%rowtype;
  member_total int;
begin
  select * into r from rides where id = p_ride_id;
  if r.id is null then
    raise exception 'ride not found';
  end if;

  if r.status = 'ended' or r.status = 'cancelled' then
    raise exception 'capacity cannot be changed after the ride is over';
  end if;

  if not is_ride_leader(p_ride_id) then
    raise exception 'not authorized: only the ride lead can change capacity';
  end if;

  if p_capacity is not null and (p_capacity < 1 or p_capacity > 50) then
    raise exception 'capacity must be between 1 and 50, or null for no limit';
  end if;

  select count(*) into member_total from ride_members where ride_id = p_ride_id;
  if p_capacity is not null and p_capacity < member_total then
    raise exception 'capacity cannot be below the current rider count (%)', member_total;
  end if;

  update rides set member_capacity = p_capacity where id = p_ride_id;
end;
$$;

comment on function update_ride_capacity(uuid, int) is
  'Lead/co-lead adjusts member_capacity on a draft or active ride (null = no limit). Guards: lead-only, draft/active only, 1..50, never below current member count.';
