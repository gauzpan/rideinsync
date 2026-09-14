-- ============================================================================
-- M0 correctness hardening (2/2): transactional SOS raise
-- ----------------------------------------------------------------------------
-- sendSos (src/lib/sos.ts) previously ran 3 sequential unwrapped client
-- inserts: sos_alerts (required), rider_positions + ride_events
-- (best-effort, errors swallowed client-side). That's not atomic: a client
-- that dies mid-sequence (or a flaky network) between calls can leave a
-- sos_alerts row with no matching ride_events row, and/or no position fix.
-- This RPC makes the whole raise one round trip inside one transaction.
--
-- sos_alerts insert stays required: if it fails, the whole call fails and
-- the client surfaces/can retry the error — same as today.
--
-- rider_positions and ride_events inserts stay best-effort ON PURPOSE, even
-- though everything now runs in a single transaction. Per sendSos's own
-- header comment: "Sending never blocks on GPS: a location read that
-- denies/times out yields a null location and the alert is still raised."
-- That design intent extends here — a rider mid-emergency must never have
-- their SOS alert fail because, say, a stray/corrupted GPS fix now gets
-- rejected by validate_rider_position() (0021_position_validation.sql), or
-- any other transient issue on those two tables. Each is wrapped in its own
-- nested block with `exception when others` so a failure there is logged
-- (via RAISE WARNING, visible in Postgres logs) and swallowed without
-- rolling back the sos_alerts insert.
-- ============================================================================
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

  -- Required: this is the alert itself. Any failure here fails the call.
  insert into sos_alerts (ride_id, user_id, kind, payload)
  values (p_ride_id, p_user_id, 'manual', p_payload)
  returning id into v_alert_id;

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
