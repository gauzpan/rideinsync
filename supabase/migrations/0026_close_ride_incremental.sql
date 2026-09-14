-- ============================================================================
-- M4 Task 1 (2/2) + Task 2 — incremental distance in close_ride, and moving
-- close_ride's slow per-member work off the request path.
-- See docs/scale-readiness-roadmap.md M4.
-- ----------------------------------------------------------------------------
-- Split design:
--   * close_ride(p_ride_id) stays the name/signature the client calls
--     (src/lib/ending.ts's closeRide(), invoked from LiveOps.tsx and
--     RideSummaryPage.tsx) — smallest possible change to the client
--     contract. It now does only the fast, synchronous part: the leader/
--     idempotency checks, flipping rides.status to 'ended' + ended_at, and
--     enqueuing a ride_close_jobs row. That UPDATE is what
--     useNavigateOnRideEnd's `rides` postgres_changes listener (via the
--     shared ride-<id> channel, src/lib/rideChannel.ts) reacts to — so the
--     "ride ended, navigate to summary" UX fires exactly as fast as before
--     (faster, actually: today it had to wait for the whole per-member loop
--     to commit first, since it's all one transaction; now that loop happens
--     in a separate, later transaction).
--   * finalize_ride_close(p_ride_id) is the slow part: the per-member loop
--     (now cheap — reads latest_positions.distance_m instead of rescanning
--     rider_positions, 0025_latest_positions_distance.sql), user_stats
--     upserts, badge awards, and the final ride_summaries write. Identical
--     side effects/logic to the old close_ride body, just relocated.
--   * process_ride_close_jobs() is the pg_cron worker (same
--     pg_cron-calls-a-plpgsql-function pattern as
--     0024_broadcast_aggregator.sql's aggregate_and_broadcast_positions) that
--     picks up pending ride_close_jobs rows and runs finalize_ride_close for
--     each, marking the job done (or failed, logged via RAISE WARNING, so one
--     bad ride never blocks the rest of the batch).
--
-- UX implication (see report): ride_summaries/user_stats/badges are no
-- longer guaranteed present the instant the client observes status='ended'.
-- RideSummaryPage's getRideSummary() already does a plain
-- `.maybeSingle()` read with no polling/retry, so a summary opened in the
-- few seconds before process_ride_close_jobs' next tick will render 0 km /
-- 0 min / no badges rather than erroring — cosmetically incomplete, not
-- broken. subscribeToBadges' badge_awarded Realtime listener was already
-- async today, so that part of the UX is unaffected. Worth a follow-up (not
-- in this milestone's scope) if the summary screen should poll/refresh
-- itself until ride_close_jobs.status = 'done'.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ride_close_jobs — minimal queue table, one row per ride (a ride only ever
-- needs closing once; re-enqueue attempts are no-ops via ON CONFLICT below).
-- No RLS policies: this is written/read only by SECURITY DEFINER functions
-- and the pg_cron worker (which runs as the job owner, not through PostgREST/
-- RLS), so "enabled, no policies" correctly denies all direct client access
-- while imposing no restriction on the trusted server-side path.
-- ---------------------------------------------------------------------------
create table ride_close_jobs (
  ride_id      uuid primary key references rides (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'processing', 'done', 'failed')),
  enqueued_at  timestamptz not null default now(),
  processed_at timestamptz
);
create index ride_close_jobs_status_idx on ride_close_jobs (status, enqueued_at);

alter table ride_close_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- close_ride — fast/sync entry point. Same signature as 0011_ending.sql's
-- version; behavior is a strict subset of it (everything below the old
-- per-member loop moved to finalize_ride_close).
-- ---------------------------------------------------------------------------
create or replace function close_ride(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r rides%rowtype;
begin
  select * into r from rides where id = p_ride_id;
  if r.id is null then raise exception 'no such ride'; end if;
  if not is_ride_leader(p_ride_id) then raise exception 'not authorized'; end if;

  -- Idempotent: a ride already closed is a no-op (unchanged from before).
  if r.status = 'ended' then return; end if;

  update rides set status = 'ended', ended_at = now(),
    retention_until = coalesce(retention_until, now() + interval '30 days')
    where id = p_ride_id;

  -- Enqueue the slow part. ON CONFLICT DO NOTHING: close_ride is
  -- leader-gated but not itself locked, so two near-simultaneous calls could
  -- both pass the `r.status = 'ended'` check above before either commits;
  -- the ride_close_jobs PK makes the second enqueue a no-op rather than an
  -- error, matching close_ride's existing idempotent-by-design contract.
  insert into ride_close_jobs (ride_id) values (p_ride_id)
  on conflict (ride_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_ride_close — the slow part, run by the worker below. Body is the
-- old close_ride's per-member loop + summary write, unchanged except reading
-- distance from latest_positions.distance_m (M4.1) instead of rescanning
-- rider_positions with a windowed haversine. Not reachable by ordinary
-- clients (see revoke below) — only the pg_cron worker calls it.
-- ---------------------------------------------------------------------------
create or replace function finalize_ride_close(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r          rides%rowtype;
  m          record;
  dist_m     bigint;
  pod_dist   bigint := 0;
  home_cnt   int;
  unconf_cnt int;
  total_cnt  int;
  new_rides  int;
begin
  select * into r from rides where id = p_ride_id;
  if r.id is null then return; end if; -- ride vanished (deleted) — nothing to finalize

  for m in select * from ride_members where ride_id = p_ride_id loop
    -- M4.1: read the incrementally-maintained total instead of rescanning
    -- rider_positions. A member with no latest_positions row (never sent a
    -- GPS fix) falls back to 0, same as the old rescan would have summed to
    -- for a member with zero position rows.
    select round(coalesce(lp.distance_m, 0))::bigint into dist_m
      from latest_positions lp
      where lp.ride_id = p_ride_id and lp.user_id = m.user_id;
    dist_m := coalesce(dist_m, 0);

    pod_dist := pod_dist + dist_m;

    -- Upsert this rider's per-mode lifetime stats.
    insert into user_stats (user_id, mode, rides_completed, distance_m, rides_led)
    values (m.user_id, r.travel_mode, 1, dist_m,
            case when m.role in ('leader', 'co_leader') then 1 else 0 end)
    on conflict (user_id, mode) do update set
      rides_completed = user_stats.rides_completed + 1,
      distance_m      = user_stats.distance_m + dist_m,
      rides_led       = user_stats.rides_led +
                        case when m.role in ('leader', 'co_leader') then 1 else 0 end,
      updated_at      = now();

    select rides_completed into new_rides
      from user_stats where user_id = m.user_id and mode = r.travel_mode;

    -- Badge awards — identical conditions/thresholds to the old close_ride.
    perform award_badge(m.user_id, 'first_ride', p_ride_id, new_rides = 1);
    perform award_badge(m.user_id, 'century', p_ride_id, dist_m >= 100000);
    perform award_badge(m.user_id, 'safe_sweep', p_ride_id, m.role = 'sweep');
  end loop;

  -- Pod roll-up for the summary screen.
  select count(*),
         count(*) filter (where reached_home_at is not null),
         count(*) filter (where status <> 'arrived')
    into total_cnt, home_cnt, unconf_cnt
    from ride_members where ride_id = p_ride_id;

  insert into ride_summaries (ride_id, total_distance_m, total_time_s, ended_at,
                              riders_total, riders_home, arrival_unconfirmed)
  values (p_ride_id, pod_dist,
          coalesce(extract(epoch from (coalesce(r.ended_at, now()) - r.created_at))::int, 0),
          coalesce(r.ended_at, now()),
          total_cnt, home_cnt, unconf_cnt)
  on conflict (ride_id) do nothing;
end;
$$;

-- Internal only — must not be callable directly via the client API (it's
-- SECURITY DEFINER and takes an arbitrary ride_id with none of close_ride's
-- leader/idempotency gating). Only the pg_cron worker below calls it, which
-- runs as the job's owning role, unaffected by these revokes.
revoke execute on function finalize_ride_close(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- process_ride_close_jobs — pg_cron worker. Same pattern as
-- 0024_broadcast_aggregator.sql's aggregate_and_broadcast_positions: a plain
-- plpgsql function scheduled directly via cron.schedule, no Edge Function or
-- pg_net involved (finalize_ride_close is pure SQL, so there's no reason to
-- leave Postgres for this one — unlike M4 Task 3's push fanout, which must
-- reach Deno for the actual webpush send).
-- ---------------------------------------------------------------------------
create or replace function public.process_ride_close_jobs()
returns void
language plpgsql security definer set search_path = public as $$
declare
  j record;
begin
  for j in select ride_id from ride_close_jobs where status = 'pending' order by enqueued_at loop
    begin
      update ride_close_jobs set status = 'processing' where ride_id = j.ride_id;
      perform finalize_ride_close(j.ride_id);
      update ride_close_jobs set status = 'done', processed_at = now() where ride_id = j.ride_id;
    exception when others then
      update ride_close_jobs set status = 'failed', processed_at = now() where ride_id = j.ride_id;
      raise warning 'process_ride_close_jobs: ride % failed: %', j.ride_id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke execute on function process_ride_close_jobs() from public, anon, authenticated;

comment on function public.process_ride_close_jobs() is
  'M4 async worker: picks up pending ride_close_jobs rows and runs '
  'finalize_ride_close for each (per-member distance/badges + the '
  'ride_summaries write), then marks the job done/failed. Scheduled via '
  'pg_cron, see the cron.schedule call below.';

-- 5s tick — much lower frequency than the 2s position-broadcast aggregator
-- (docs/scale-readiness-roadmap.md M4 goal: "matters more, not less, under
-- many small rides" but this is still a per-ride-ending event, not a
-- per-second one). Named so it's easy to find/unschedule:
-- select cron.unschedule('process-ride-close-jobs').
select cron.schedule(
  'process-ride-close-jobs',
  '5 seconds',
  $$select public.process_ride_close_jobs();$$
);
