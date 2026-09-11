-- ============================================================================
-- Flow 1 (Onboarding) — ticket 05: lead approval, roster & role assignment.
-- ----------------------------------------------------------------------------
-- Additive only: adds two SECURITY DEFINER functions. Does not ALTER any
-- existing table (see docs/DATA_MODEL.md — rides/ride_members/ride_join_requests
-- are seam/Flow-1-owned tables read by other flows; this mirrors the existing
-- request_join_ride / approve_join_request / get_ride_preview pattern rather
-- than loosening RLS policies).
-- ============================================================================

-- 0001_foundation.sql only grants the leader SELECT on ride_join_requests
-- (join_requests_select), not UPDATE — so declining a request needs a
-- SECURITY DEFINER RPC, same reasoning as approve_join_request.
create or replace function decline_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req ride_join_requests%rowtype;
begin
  select * into req from ride_join_requests where id = p_request_id;
  if req.id is null then raise exception 'no such request'; end if;
  if not is_ride_leader(req.ride_id) then raise exception 'not authorized'; end if;

  update ride_join_requests
    set status = 'rejected', decided_at = now(), decided_by = auth.uid()
    where id = p_request_id;
end;
$$;

comment on function decline_join_request(uuid) is
  'Leader/co-leader declines a pending join request. SECURITY DEFINER: ride_join_requests has no leader UPDATE policy, only SELECT (see 0001_foundation.sql).';

-- Assigns sweep/co_leader (or clears a member back to rider) from the roster.
-- Demotes any existing holder of that role back to 'rider' first so the
-- schema's one-leader/one-sweep partial unique indexes (ride_one_leader_idx /
-- ride_one_sweep_idx) are never violated, and so co_leader (unconstrained at
-- the DB level) still behaves as a single assignable slot in the UI.
-- Reassigning the leader role itself is out of scope.
create or replace function assign_ride_role(p_ride_id uuid, p_user_id uuid, p_role member_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role member_role;
begin
  if not is_ride_leader(p_ride_id) then raise exception 'not authorized'; end if;
  if p_role not in ('sweep', 'co_leader', 'rider') then
    raise exception 'cannot assign role %', p_role;
  end if;

  select role into target_role from ride_members where ride_id = p_ride_id and user_id = p_user_id;
  if target_role is null then raise exception 'not a member of this ride'; end if;
  if target_role = 'leader' then raise exception 'cannot reassign the leader'; end if;

  if p_role in ('sweep', 'co_leader') then
    update ride_members
      set role = 'rider'
      where ride_id = p_ride_id and role = p_role and user_id <> p_user_id;
  end if;

  update ride_members set role = p_role where ride_id = p_ride_id and user_id = p_user_id;
end;
$$;

comment on function assign_ride_role(uuid, uuid, member_role) is
  'Leader assigns sweep/co_leader (or clears back to rider) from the roster. SECURITY DEFINER: ride_members_write_self only allows updating your own row (see 0001_foundation.sql), so cross-member role writes must go through the leader-checked RPC.';
