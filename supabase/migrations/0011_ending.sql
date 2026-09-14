-- ============================================================================
-- Flow 6 — Ending Journey (Gaurav) — migration 0011. Builds on 0001_foundation.sql.
-- See flow6-plan.md for the functional requirements behind each change.
--
-- ⚠ Coordination: this migration reshapes user_stats and badges, which are
--   Flow 2 (Mithul) tables per docs/DATA_MODEL.md. Land with his sign-off.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type travel_mode as enum ('motorcycle', 'car', 'cycle');
create type feedback_sentiment as enum ('like', 'dislike', 'can_be_better');

-- New event value for the "badge awarded" Realtime announcement. (ADD VALUE is
-- not used elsewhere in this migration, so it is safe outside a txn on PG15.)
alter type event_type add value if not exists 'badge_awarded';

-- ---------------------------------------------------------------------------
-- rides — travel mode (drives per-mode stats & badges)
-- ---------------------------------------------------------------------------
alter table rides add column travel_mode travel_mode not null default 'motorcycle';

-- ---------------------------------------------------------------------------
-- ride_members — home acknowledgement (decoupled from feedback)
-- ---------------------------------------------------------------------------
alter table ride_members add column reached_home_at timestamptz;

-- ---------------------------------------------------------------------------
-- ride_feedback — 3-way sentiment + optional texts; drop the old bool
-- ---------------------------------------------------------------------------
alter table ride_feedback drop column if exists reached_home;
alter table ride_feedback add column sentiment feedback_sentiment;
alter table ride_feedback add column liked_text text;
alter table ride_feedback add column improve_text text;

-- Tighten visibility: only the author and the ride's lead/co-lead can read
-- feedback (org analytics reads server-side via service role, not the client).
drop policy if exists ride_feedback_select on ride_feedback;
create policy ride_feedback_select on ride_feedback
  for select using (user_id = auth.uid() or is_ride_leader(ride_id));

-- ---------------------------------------------------------------------------
-- user_stats — per travel-mode; XP column present but unused in v1
-- ---------------------------------------------------------------------------
alter table user_stats add column mode travel_mode not null default 'motorcycle';
alter table user_stats add column xp bigint not null default 0;
alter table user_stats drop constraint user_stats_pkey;
alter table user_stats add primary key (user_id, mode);

-- ---------------------------------------------------------------------------
-- badges — scope the catalog per mode + optional numeric threshold
-- ---------------------------------------------------------------------------
alter table badges add column mode travel_mode;       -- null = mode-agnostic
alter table badges add column threshold numeric;       -- e.g. distance metres

-- ---------------------------------------------------------------------------
-- ride_summaries — pod roll-up counts for the summary screen
-- ---------------------------------------------------------------------------
alter table ride_summaries add column riders_total int not null default 0;
alter table ride_summaries add column riders_home int not null default 0;
alter table ride_summaries add column arrival_unconfirmed int not null default 0;

-- ============================================================================
-- close_ride(ride_id) — the single trusted path that finalizes a ride.
-- Leader/co-leader only, idempotent. Computes distance/time from the position
-- history, updates each member's per-mode user_stats, awards badges, and emits
-- a badge_awarded event per award. RLS blocks the client from writing other
-- riders' stats/badges, which is why this is SECURITY DEFINER.
-- ============================================================================
create or replace function close_ride(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r            rides%rowtype;
  m            record;
  dist_m       bigint;
  pod_dist     bigint := 0;
  home_cnt     int;
  unconf_cnt   int;
  total_cnt    int;
  new_rides    int;
begin
  select * into r from rides where id = p_ride_id;
  if r.id is null then raise exception 'no such ride'; end if;
  if not is_ride_leader(p_ride_id) then raise exception 'not authorized'; end if;

  -- Idempotent: a ride already closed is a no-op.
  if r.status = 'ended' then return; end if;

  update rides set status = 'ended', ended_at = now(),
    retention_until = coalesce(retention_until, now() + interval '30 days')
    where id = p_ride_id;

  -- Per-member stats + badges.
  for m in select * from ride_members where ride_id = p_ride_id loop
    -- Distance via haversine over the ordered position history. Segment length
    -- is computed per row with a window (lag), then summed in the outer query —
    -- a window function cannot sit directly inside an aggregate.
    select coalesce(sum(seg), 0)::bigint into dist_m
      from (
        select 2 * 6371000 * asin(sqrt(
                 power(sin(radians(lat - lag(lat) over w) / 2), 2) +
                 cos(radians(lag(lat) over w)) * cos(radians(lat)) *
                 power(sin(radians(lng - lag(lng) over w) / 2), 2)
               )) as seg
        from rider_positions
        where ride_id = p_ride_id and user_id = m.user_id
        window w as (order by recorded_at)
      ) s;

    pod_dist := pod_dist + coalesce(dist_m, 0);

    -- Upsert this rider's per-mode lifetime stats.
    insert into user_stats (user_id, mode, rides_completed, distance_m, rides_led)
    values (m.user_id, r.travel_mode, 1, coalesce(dist_m, 0),
            case when m.role in ('leader', 'co_leader') then 1 else 0 end)
    on conflict (user_id, mode) do update set
      rides_completed = user_stats.rides_completed + 1,
      distance_m      = user_stats.distance_m + coalesce(dist_m, 0),
      rides_led       = user_stats.rides_led +
                        case when m.role in ('leader', 'co_leader') then 1 else 0 end,
      updated_at      = now();

    select rides_completed into new_rides
      from user_stats where user_id = m.user_id and mode = r.travel_mode;

    -- Badge awards (idempotent via unique(user_id, badge_key)). Thresholds are
    -- placeholders — final per-mode values are TBD (see flow6-plan.md).
    perform award_badge(m.user_id, 'first_ride', p_ride_id, new_rides = 1);
    perform award_badge(m.user_id, 'century', p_ride_id, coalesce(dist_m, 0) >= 100000);
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
          coalesce(extract(epoch from (now() - r.created_at))::int, 0), now(),
          total_cnt, home_cnt, unconf_cnt)
  on conflict (ride_id) do nothing;
end;
$$;

-- Helper: award a badge when `cond` holds and emit the announcement event.
create or replace function award_badge(p_user uuid, p_badge text, p_ride uuid, cond boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not cond then return; end if;
  insert into user_badges (user_id, badge_key, ride_id)
  values (p_user, p_badge, p_ride)
  on conflict (user_id, badge_key) do nothing;
  -- Emit only if the award actually happened (row inserted this call).
  if found then
    insert into ride_events (ride_id, user_id, type, payload)
    values (p_ride, p_user, 'badge_awarded', jsonb_build_object('badge_key', p_badge));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- reached_home() — a rider marks themselves home after the ride (self only).
-- ---------------------------------------------------------------------------
create or replace function reached_home(p_ride_id uuid)
returns void
language sql security definer set search_path = public as $$
  update ride_members set reached_home_at = now()
  where ride_id = p_ride_id and user_id = auth.uid();
$$;
