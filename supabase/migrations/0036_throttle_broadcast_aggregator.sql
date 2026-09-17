-- ============================================================================
-- Fix realtime.messages disk bloat — throttle M3 aggregator + drop unused
-- publication.
-- ----------------------------------------------------------------------------
-- Root cause: 0024_broadcast_aggregator.sql scheduled pg_cron every
-- '2 seconds', calling realtime.send() once per ACTIVE ride per tick. Every
-- call inserts rows into realtime.messages (retained ~3 days). Any ride stuck
-- in status='active' (demo / abandoned rides) writes ~43k rows/day even with
-- zero movement — enough to fill disk and push the DB into read-only mode
-- (ERROR 25006 on TRUNCATE/DELETE).
--
-- Apply AFTER the DB is writable again. Each section below is a standalone
-- statement — run them one at a time in the SQL Editor (do NOT run the whole
-- file in one go; the editor splits multi-statement scripts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Throttle the tick: 2s -> 15s.
-- Run these two lines one at a time. Ignore an error from the first line if
-- the job name doesn't exist yet.
-- ----------------------------------------------------------------------------
select cron.unschedule('aggregate-and-broadcast-positions');

select cron.schedule(
  'aggregate-and-broadcast-positions',
  '15 seconds',
  $cron$select public.aggregate_and_broadcast_positions();$cron$
);

-- ----------------------------------------------------------------------------
-- 2. Skip idle rides: recreate the aggregator with a fresh-activity guard.
-- Same payload/status logic as 0024, plus one early CONTINUE per ride.
-- Run this whole CREATE FUNCTION as one statement.
-- ----------------------------------------------------------------------------
create or replace function public.aggregate_and_broadcast_positions()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_ride record;
  v_payload jsonb;
  v_has_fresh boolean;
begin
  for v_ride in select id from rides where status = 'active' loop
    select exists (
      select 1 from latest_positions lp
      where lp.ride_id = v_ride.id
        and now() - lp.recorded_at <= interval '20 seconds'
    ) into v_has_fresh;

    if not v_has_fresh then
      continue;
    end if;

    with pos as (
      select lp.user_id, lp.lat, lp.lng, lp.heading, lp.speed, lp.accuracy, lp.recorded_at
      from latest_positions lp
      where lp.ride_id = v_ride.id
    ),
    fresh as (
      select * from pos where now() - recorded_at <= interval '20 seconds'
    ),
    riders as (
      select
        rm.user_id,
        p.lat, p.lng, p.heading, p.speed, p.accuracy, p.recorded_at,
        case
          when rm.status in ('stopped', 'leaving') then 'stopped'
          when p.lat is null or now() - p.recorded_at > interval '15 seconds' then 'stale'
          when (
            select min(
              2 * 6371000 * asin(sqrt(
                sin(radians(f.lat - p.lat) / 2) ^ 2 +
                cos(radians(p.lat)) * cos(radians(f.lat)) *
                sin(radians(f.lng - p.lng) / 2) ^ 2
              ))
            )
            from fresh f
            where f.user_id <> rm.user_id
          ) > 220 then 'behind'
          else 'intact'
        end as status
      from ride_members rm
      left join pos p on p.user_id = rm.user_id
    )
    select jsonb_build_object(
      'riders', coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id,
        'lat', lat,
        'lng', lng,
        'heading', heading,
        'speed', speed,
        'accuracy', accuracy,
        'recorded_at', recorded_at,
        'status', status
      )), '[]'::jsonb)
    )
    into v_payload
    from riders;

    perform realtime.send(v_payload, 'pack', 'ride-' || v_ride.id::text, false);
  end loop;
end;
$func$;

comment on function public.aggregate_and_broadcast_positions() is
  'M3 server aggregator (throttled, see 0036): per active ride WITH fresh '
  'fixes (<=20s), computes each rider''s group status from latest_positions '
  'and broadcasts {riders:[...]} as a "pack" event on ride-<id> every 15s. '
  'Idle rides are skipped so they cost zero realtime.messages rows.';

-- ----------------------------------------------------------------------------
-- 3. Drop the unused history table from realtime fanout. No client subscribes
-- to rider_positions anymore (rideChannel.ts listens to latest_positions +
-- broadcast 'pack'). Ignore the error if it is already removed.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime drop table rider_positions;
