-- ============================================================================
-- 0002 — Fix request_join_ride enum cast (bug in 0001_foundation.sql)
-- ----------------------------------------------------------------------------
-- The CASE expression returns `text`, but ride_join_requests.status is the
-- `join_request_status` enum. Postgres won't implicitly cast text→enum, so the
-- insert failed with SQLSTATE 42804 and EVERY join (demo auto-approve and real
-- request) errored. Cast the CASE result to the enum explicitly.
--
-- Owner note: request_join_ride belongs to Flow 1 (Mithul). This is a blocking
-- bug fix surfaced while wiring Flow 3; replaces the function only, no schema
-- change. `create or replace` is idempotent and safe to re-run.
-- ============================================================================

create or replace function request_join_ride(join_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r        rides%rowtype;
  req_id   uuid;
begin
  select * into r from rides where code = join_code and status <> 'ended';
  if r.id is null then
    raise exception 'invalid or ended ride';
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
