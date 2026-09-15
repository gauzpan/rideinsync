-- North Star Metric: Sustained group-tracked ride-participations per month.
-- ----------------------------------------------------------------------------
-- Packages the NSM as reusable views so it can be read with a plain `select`.
-- Additive, idempotent (create or replace), no data changes. Reads only.
--
-- NSM (plain language): every month, how many riders actually rode WITH the
-- group and stayed live-tracked the whole way. A ÷ B = qualifying sustained
-- (person, ride) participations ÷ calendar month.
--
-- A participation qualifies when, for a started, non-demo ride:
--   * the person stayed live-tracked across >= 70% of the ride's active
--     duration (minute-bucket coverage — tolerates short fuel/rest breaks,
--     excludes riders who went dark and never returned), OR is a pillion
--     linked to such a rider (pillions share a bike and send no position of
--     their own, so they are credited via their rider), and
--   * the ride had >= 2 such participants (a real GROUP ride, not a solo).
--
-- Why the "sustained >= 70%" gate matters (the moat + un-gameability): the
-- product's differentiator is keeping the WHOLE pack tracked, nobody lost. A
-- rider who got one GPS fix then vanished is exactly the failure we exist to
-- prevent, so a fix alone must NOT count. The sustained bar is also what makes
-- the metric un-gameable — you cannot inflate it with signups or discounts,
-- only with real riders really tracked through real rides.
--
-- Source data (all already written by the live product — no instrumentation):
--   rider_positions (timestamped timeline), rides (status/is_demo/ended_at),
--   ride_members, ride_pillion_links.
--
-- Caveats (documented in docs/north-star-metric.md):
--   * No explicit ride-start timestamp exists, so ride_start is APPROXIMATED
--     as the ride's first rider_positions.recorded_at. Precision upgrade: add a
--     started_at column stamped on the draft->active transition (startRide).
--   * Coverage is minute-bucket based at 1-minute granularity; threshold 0.70
--     is a judgment knob — watch the TREND, not the absolute level.
--   * Unlinked pillions are excluded (we can't place them on the map).
--   * Admin/service-role read only: rider_positions has RLS with no public
--     SELECT, so these views return rows only to a role that bypasses RLS.

-- Per-participation base view: one row per qualifying (person, ride).
create or replace view v_nsm_participations as
with ride_window as (
  -- Started, real rides that have at least one position. ride_start is
  -- approximated from the first position; ride_end prefers the explicit
  -- ended_at, falling back to the last position.
  select
    p.ride_id,
    min(p.recorded_at)                       as ride_start,
    coalesce(r.ended_at, max(p.recorded_at)) as ride_end
  from rider_positions p
  join rides r on r.id = p.ride_id
  where r.is_demo = false
    and r.status in ('active', 'ended')
  group by p.ride_id, r.ended_at
),
ride_duration as (
  select
    ride_id, ride_start, ride_end,
    greatest(1, ceil(extract(epoch from (ride_end - ride_start)) / 60.0))::int as duration_min
  from ride_window
  where ride_end > ride_start
),
rider_coverage as (
  -- Distinct minute-buckets in which each position-sender had a fix.
  select
    p.ride_id,
    p.user_id,
    count(distinct date_trunc('minute', p.recorded_at)) as active_min
  from rider_positions p
  join ride_duration d on d.ride_id = p.ride_id
  group by p.ride_id, p.user_id
),
qualifying_riders as (
  -- Position-senders who stayed tracked across >= 70% of the ride.
  select c.ride_id, c.user_id
  from rider_coverage c
  join ride_duration d on d.ride_id = c.ride_id
  where (c.active_min::numeric / d.duration_min) >= 0.70
),
pillion_participations as (
  -- Pillions linked to a qualifying rider on the same ride (credited by proxy).
  select distinct l.ride_id, l.pillion_user_id as user_id
  from ride_pillion_links l
  join qualifying_riders q
    on q.ride_id = l.ride_id and q.user_id = l.rider_user_id
),
all_participations as (
  select ride_id, user_id, 'rider'::text   as kind from qualifying_riders
  union
  select ride_id, user_id, 'pillion'::text as kind from pillion_participations
),
ride_group_size as (
  select ride_id, count(*) as participant_count
  from all_participations
  group by ride_id
)
select
  ap.ride_id,
  ap.user_id,
  ap.kind,
  (d.ride_end at time zone 'UTC')::date        as ride_date,
  date_trunc('month', d.ride_end)::date        as ride_month
from all_participations ap
join ride_group_size g on g.ride_id = ap.ride_id
join ride_duration  d on d.ride_id = ap.ride_id
where g.participant_count >= 2;   -- group rides only (>= 2 sustained participants)

comment on view v_nsm_participations is
  'North Star base: one row per qualifying sustained group-tracked (person, ride) participation. Admin/service-role read only.';

-- Monthly headline: the North Star number.
create or replace view v_nsm_monthly as
select
  ride_month,
  count(*)                                  as tracked_group_participations,
  count(distinct ride_id)                   as group_rides,
  count(distinct user_id)                   as distinct_riders
from v_nsm_participations
group by ride_month
order by ride_month;

comment on view v_nsm_monthly is
  'North Star Metric per calendar month: sustained group-tracked ride-participations (plus supporting counts).';
