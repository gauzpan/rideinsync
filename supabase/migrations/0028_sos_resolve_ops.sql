-- SOS resolution by the ops crew (leader / co-lead / sweep).
-- Previously only the rider in distress could close their own alert
-- (sos_alerts_resolve_own, 0004_sos.sql), so an SOS stayed pinned on the live
-- ride view until that rider acted. This adds a permissive UPDATE policy for
-- ops roles; the owner policy is unchanged.

create or replace function is_ride_ops(rid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from ride_members m
    where m.ride_id = rid and m.user_id = auth.uid()
      and m.role in ('leader', 'co_leader', 'sweep')
  );
$$;

create policy sos_alerts_resolve_ops on sos_alerts
  for update using (is_ride_ops(ride_id)) with check (is_ride_ops(ride_id));
