-- ============================================================================
-- Publish latest_positions to Realtime — client-side fallback for the M3
-- aggregator broadcast.
-- ----------------------------------------------------------------------------
-- M3 (0024_broadcast_aggregator.sql) moved the live position feed to a
-- server-side pg_cron aggregator that reads latest_positions and ships one
-- `pack` broadcast per active ride. latest_positions was deliberately left
-- OUT of the supabase_realtime publication because the broadcast was meant to
-- be the sole delivery path.
--
-- In practice that broadcast is fragile to run end-to-end: pg_cron's
-- sub-minute ('N seconds') scheduling, realtime.send's broadcast-from-database
-- delivery, and the Edge Function ingest all have to be live at once. When any
-- of them isn't (local dev without the cron tick is the common case, but it's
-- not the only one), fellow riders' pins and the in-sync count silently freeze
-- after the initial seed while each rider's own GPS arrow — which never goes
-- through this path — keeps working. That mismatch is exactly the reported bug.
--
-- Adding latest_positions to the publication lets the client subscribe to its
-- row changes directly (see src/lib/rideChannel.ts's `latestPositions` binding
-- and useRideChannel.ts, which derives status client-side via geo.ts's
-- deriveStatus when the aggregator's status is absent). The aggregator stays
-- the authoritative status source when it IS running; this is a resilient
-- fallback, not a replacement. It's one binding on the already-open per-ride
-- channel, so M3.3's "one channel per client" win is unaffected.
--
-- replica identity full so UPDATE payloads carry the full new row (lat/lng/
-- heading/recorded_at), matching how sos_alerts/sos_responses are set up in
-- 0004_sos.sql — the default (primary key only) would omit the moved
-- coordinates from the change payload.
-- ============================================================================

alter table latest_positions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'latest_positions'
  ) then
    alter publication supabase_realtime add table latest_positions;
  end if;
end $$;
