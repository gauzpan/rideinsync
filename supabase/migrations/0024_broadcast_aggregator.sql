-- ============================================================================
-- M3 (1/1) — server aggregator: broadcast-based live feed
-- ----------------------------------------------------------------------------
-- See docs/scale-readiness-roadmap.md M3. Today the client (useRideChannel.ts)
-- derived each rider's group status itself from raw `rider_positions`
-- postgres_changes INSERTs — nearestGapMeters, an O(N) scan per rider,
-- recomputed on nearly every incoming position from *any* member. That's
-- bounded and cheap at one ride's scale (<=50 members) but is the wrong unit
-- of cost at the confirmed "many small rides" scale shape: 1000 concurrent
-- riders is 1000 realtime deliveries fanned out across every subscriber of
-- every ride, project-wide, every time anyone moves.
--
-- This function replaces that with one tick, per active ride, that reads the
-- hot table (latest_positions, M2) once, computes every member's status in
-- one query, and ships it as a single broadcast. Clients then just render
-- the payload — see useRideChannel.ts's `onPack` handler.
--
-- Mechanism choice: pg_cron job calling this plpgsql function, which
-- broadcasts via `realtime.send()` (Realtime's "Broadcast from Database"
-- Postgres function) — NOT a scheduled Edge Function. Why:
--   - Both pg_cron and realtime.send() are extensions/functions Supabase
--     Postgres already ships; wiring them together is zero new deployable
--     artifacts. A scheduled-Edge-Function alternative needs pg_cron *and*
--     pg_net (for pg_cron to reach an HTTP endpoint on a timer) *and* a new
--     Deno function *and* its own service-role plumbing — strictly more
--     moving parts for the same result. push-notify's Edge Function pattern
--     doesn't fit here anyway: it's a per-event, client-invoked function,
--     not a scheduler — there's no request to model this on.
--   - The aggregation itself (join latest_positions to ride_members, compute
--     a per-row status, group into one JSON payload per ride) is exactly the
--     kind of thing SQL expresses in one statement; round-tripping rows out
--     to JS just to recompute an enum and ship it back in would be pure
--     overhead here.
--   - This is the repo's first pg_cron usage (flagged as such in the
--     roadmap's tooling notes) — `create extension if not exists pg_cron`
--     below is a one-time cost either mechanism would have paid in some
--     form (an Edge-Function-on-a-timer still needs pg_cron+pg_net to fire
--     it, since Supabase Edge Functions have no built-in scheduler of their
--     own outside the Dashboard's own cron UI, which isn't scriptable here).
--
-- Thresholds below are ported from src/lib/geo.ts — keep in sync:
--   STALE_MS  = 15000 ms  (geo.ts's STALE_MS)      -> interval '15 seconds'
--   BEHIND_M  = 220 m     (geo.ts's BEHIND_M)      -> literal 220
--   "fresh enough to count toward another rider's gap" = 20000 ms, previously
--     inlined in useRideChannel.ts's old `riders` useMemo (not a geo.ts
--     constant) -> interval '20 seconds'
--
-- Broadcasts on the *existing* `ride-<rideId>` channel name (the one
-- useRideChannel.ts / src/lib/rideChannel.ts already subscribe to) as event
-- 'pack' — no new channel. `private: false` (realtime.send's 4th arg) is
-- used deliberately: this project has no `realtime.messages` RLS policies
-- set up (broadcast today, and before this migration, has always been used
-- in the unauthenticated/public-channel mode), so a private broadcast would
-- be rejected for every subscriber. Revisit alongside M5's "re-examine RLS
-- for the broadcast era" item if per-channel authorization is ever added.
-- ============================================================================

create extension if not exists pg_cron;

create or replace function public.aggregate_and_broadcast_positions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride record;
  v_payload jsonb;
begin
  for v_ride in select id from rides where status = 'active' loop
    with pos as (
      select lp.user_id, lp.lat, lp.lng, lp.heading, lp.speed, lp.accuracy, lp.recorded_at
      from latest_positions lp
      where lp.ride_id = v_ride.id
    ),
    fresh as (
      -- "counts toward another rider's gap" window — see header.
      select * from pos where now() - recorded_at <= interval '20 seconds'
    ),
    riders as (
      select
        rm.user_id,
        p.lat, p.lng, p.heading, p.speed, p.accuracy, p.recorded_at,
        case
          -- manual member status wins, same precedence as geo.ts's deriveStatus
          when rm.status in ('stopped', 'leaving') then 'stopped'
          -- no fix at all, or stale (geo.ts STALE_MS)
          when p.lat is null or now() - p.recorded_at > interval '15 seconds' then 'stale'
          -- gap to nearest *other* fresh rider vs geo.ts BEHIND_M, haversine
          -- (matches src/lib/geo.ts's haversineMeters/nearestGapMeters; ported
          -- to plain SQL rather than PostGIS — see M5 for the ST_DWithin/KNN
          -- follow-up once lat/lng move to GEOGRAPHY)
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
$$;

comment on function public.aggregate_and_broadcast_positions() is
  'M3 server aggregator: per active ride, computes each rider''s group '
  'status from latest_positions (porting src/lib/geo.ts deriveStatus''s '
  'thresholds to SQL) and broadcasts {riders:[...]} as a "pack" event on '
  'the ride-<id> channel. Scheduled via pg_cron, see the cron.schedule '
  'call below.';

-- 2s tick — inside the confirmed ~5s end-to-end freshness SLA
-- (docs/scale-readiness-roadmap.md), leaving headroom for broadcast delivery
-- + client render. pg_cron's sub-minute ("N seconds") scheduling syntax
-- requires pg_cron >= 1.4, which is what Supabase's Postgres images ship;
-- if the local stack's pg_cron predates that, this call fails loudly at
-- migration time rather than silently falling back to a 1-minute tick, which
-- is the right failure mode to notice, not paper over. Named so it's easy to
-- find/unschedule: select cron.unschedule('aggregate-and-broadcast-positions').
select cron.schedule(
  'aggregate-and-broadcast-positions',
  '2 seconds',
  $$select public.aggregate_and_broadcast_positions();$$
);
