-- Flow 2 — Leader member removal from live rides.
-- ----------------------------------------------------------------------------
-- 0012_flow2_remove_member.sql limited remove_ride_member to draft rides, so
-- the lead-view "Remove member" button (gated on the same rule client-side)
-- disappears the moment a ride starts — with no way to free a seat or drop
-- a no-show mid-ride. This replaces the function to allow removal while the
-- ride is in draft OR active. Ended/cancelled rides stay immutable (history
-- for summaries/feedback must not shift under Flow 6).
--
-- All other guards are unchanged: caller must be the ride leader, the leader
-- cannot be removed, target must be a member; pillion links, join requests
-- and the membership row are cleaned up as before.
-- ----------------------------------------------------------------------------

create or replace function remove_ride_member(p_ride_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r   rides%rowtype;
  mem ride_members%rowtype;
begin
  -- 1. Check ride exists
  select * into r from rides where id = p_ride_id;
  if r.id is null then
    raise exception 'ride not found';
  end if;

  -- 2. Refuse once the ride is over (ended/cancelled are history).
  if r.status = 'ended' or r.status = 'cancelled' then
    raise exception 'members cannot be removed after the ride is over';
  end if;

  -- 3. Check caller is the ride's leader
  if r.leader_id <> auth.uid() then
    raise exception 'not authorized: only the ride leader can remove members';
  end if;

  -- 4. Refuse removing the leader themselves
  if p_user_id = r.leader_id then
    raise exception 'cannot remove the ride leader';
  end if;

  -- 5. Check target user is a member of the ride
  select * into mem from ride_members where ride_id = p_ride_id and user_id = p_user_id;
  if mem.id is null then
    raise exception 'user is not a member of this ride';
  end if;
  if mem.role = 'leader' then
    raise exception 'cannot remove the ride leader';
  end if;

  -- 6. Clean up dangling pillion links (rider or pillion)
  delete from ride_pillion_links
    where ride_id = p_ride_id
      and (rider_user_id = p_user_id or pillion_user_id = p_user_id);

  -- Clean up join request so user could re-request if invited
  delete from ride_join_requests
    where ride_id = p_ride_id
      and user_id = p_user_id;

  -- Remove the membership row
  delete from ride_members
    where ride_id = p_ride_id
      and user_id = p_user_id;
end;
$$;

comment on function remove_ride_member(uuid, uuid) is
  'Leader removes another member from a draft or active ride. SECURITY DEFINER: ride_members_write_self only allows deleting your own row (see 0001_foundation.sql), so leader removals must go through this RPC.';
