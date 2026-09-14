-- ============================================================================
-- One active SOS per rider — dedup repeat presses.
-- ----------------------------------------------------------------------------
-- sendSos (src/lib/sos.ts) -> raise_sos_alert always inserted a fresh
-- sos_alerts row, so tapping SOS repeatedly (or the confirm screen
-- double-firing) raised several concurrent alerts for the same rider, each
-- re-paging the group via push + email. A rider should hold at most one
-- *active* (unresolved) SOS; further requests must resolve to that same alert
-- instead of creating a new one.
--
-- Two layers:
--   1. A partial unique index — the hard guarantee that two active alerts for
--      one (ride, rider) can't coexist even under a concurrent double-send.
--   2. raise_sos_alert now returns the existing active alert (skipping all
--      inserts) when one is present, and treats a lost unique-violation race
--      as "someone else just created it" — re-selecting and returning that id
--      rather than erroring in the rider's face mid-emergency.
-- ============================================================================

-- Collapse any pre-existing duplicates first, or the partial unique index
-- below can't be built. Keep the most recent active alert per (ride, rider);
-- resolve the older ones (self-resolved, stamped now).
with ranked as (
  select id,
         row_number() over (
           partition by ride_id, user_id
           order by triggered_at desc, id desc
         ) as rn
  from sos_alerts
  where resolved_at is null
)
update sos_alerts s
set resolved_at = now(),
    resolved_by = s.user_id
from ranked r
where s.id = r.id and r.rn > 1;

create unique index if not exists sos_alerts_one_active
  on sos_alerts (ride_id, user_id)
  where resolved_at is null;

create or replace function raise_sos_alert(
  p_ride_id uuid,
  p_user_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_alert_id uuid;
  v_location jsonb;
begin
  if p_user_id <> auth.uid() then
    raise exception 'p_user_id must match the authenticated user';
  end if;
  if not is_ride_member(p_ride_id) then
    raise exception 'not a member of this ride';
  end if;

  -- Dedup: an unresolved alert already open for this rider wins. Return it
  -- and skip every insert below, so a repeat press doesn't re-page the group.
  select id into v_alert_id
  from sos_alerts
  where ride_id = p_ride_id and user_id = p_user_id and resolved_at is null
  limit 1;
  if v_alert_id is not null then
    return v_alert_id;
  end if;

  -- Required: the alert itself. A concurrent send may win the race and trip
  -- the sos_alerts_one_active index — treat that as "already active" and
  -- return the existing row rather than failing the call.
  begin
    insert into sos_alerts (ride_id, user_id, kind, payload)
    values (p_ride_id, p_user_id, 'manual', p_payload)
    returning id into v_alert_id;
  exception when unique_violation then
    select id into v_alert_id
    from sos_alerts
    where ride_id = p_ride_id and user_id = p_user_id and resolved_at is null
    limit 1;
    return v_alert_id;
  end;

  -- Best-effort: last-known-position snapshot, if the client had a GPS fix
  -- (payload.location is null when it didn't — see sendSos).
  v_location := p_payload -> 'location';
  if v_location is not null and v_location <> 'null'::jsonb then
    begin
      insert into rider_positions (ride_id, user_id, lat, lng, accuracy, recorded_at)
      values (
        p_ride_id,
        p_user_id,
        (v_location ->> 'lat')::double precision,
        (v_location ->> 'lng')::double precision,
        (v_location ->> 'accuracy')::double precision,
        coalesce((v_location ->> 'recorded_at')::timestamptz, now())
      );
    exception when others then
      raise warning 'raise_sos_alert: rider_positions insert failed for alert %: %', v_alert_id, sqlerrm;
    end;
  end if;

  -- Best-effort: activity-feed event for this alert.
  begin
    insert into ride_events (ride_id, user_id, type, payload)
    values (p_ride_id, p_user_id, 'sos', jsonb_build_object('alert_id', v_alert_id));
  exception when others then
    raise warning 'raise_sos_alert: ride_events insert failed for alert %: %', v_alert_id, sqlerrm;
  end;

  return v_alert_id;
end;
$$;

grant execute on function raise_sos_alert(uuid, uuid, jsonb) to authenticated;
