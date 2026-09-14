-- ============================================================================
-- M0 correctness hardening (1/2): rider_positions payload validation
-- ----------------------------------------------------------------------------
-- The rider_positions insert RLS policy (0001_foundation.sql) only checks
-- user_id = auth.uid() AND is_ride_member(ride_id) — it does nothing to
-- validate the payload itself. A buggy/compromised client can insert
-- lat/lng outside valid Earth coordinates, or a GPS jump that implies an
-- impossible speed, and every downstream consumer (close_ride's haversine
-- distance calc, the live map, separation detection) silently trusts it.
--
-- This BEFORE INSERT trigger rejects:
--   1. lat outside [-90, 90] or lng outside [-180, 180].
--   2. A new fix that implies > 250 km/h versus that same user's most
--      recent prior fix on the same ride (haversine distance / elapsed
--      hours). No prior row => nothing to compare against => allowed.
-- ============================================================================
create or replace function validate_rider_position()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prev          record;
  dist_m        double precision;
  elapsed_hours double precision;
  implied_kmh   double precision;
begin
  if new.lat < -90 or new.lat > 90 then
    raise exception 'rider_positions.lat out of range: %', new.lat;
  end if;
  if new.lng < -180 or new.lng > 180 then
    raise exception 'rider_positions.lng out of range: %', new.lng;
  end if;

  select lat, lng, recorded_at into prev
    from rider_positions
    where ride_id = new.ride_id and user_id = new.user_id
    order by recorded_at desc
    limit 1;

  if prev is null then
    return new;
  end if;

  elapsed_hours := extract(epoch from (new.recorded_at - prev.recorded_at)) / 3600.0;
  if elapsed_hours <= 0 then
    -- New row is at/before the prior timestamp: nothing meaningful to divide
    -- by. Let it through rather than divide-by-zero or a nonsensical speed.
    return new;
  end if;

  -- Haversine, same formula shape as close_ride's distance calc
  -- (0011_ending.sql) — kept inline here rather than factored into a shared
  -- helper, per the house style of that function.
  dist_m := 2 * 6371000 * asin(sqrt(
              power(sin(radians(new.lat - prev.lat) / 2), 2) +
              cos(radians(prev.lat)) * cos(radians(new.lat)) *
              power(sin(radians(new.lng - prev.lng) / 2), 2)
            ));

  implied_kmh := (dist_m / 1000.0) / elapsed_hours;
  if implied_kmh > 250 then
    -- RAISE's % placeholders don't support printf-style width/precision, so
    -- round before interpolating.
    raise exception
      'rider_positions implausible speed: % km/h over % s (ride %, user %)',
      round(implied_kmh::numeric, 1), round((elapsed_hours * 3600)::numeric, 1),
      new.ride_id, new.user_id;
  end if;

  return new;
end;
$$;

create trigger validate_rider_position_trigger
  before insert on rider_positions
  for each row execute function validate_rider_position();
