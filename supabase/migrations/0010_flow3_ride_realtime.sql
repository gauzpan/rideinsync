-- ============================================================================
-- 0010 — Publish `rides` to Realtime (Flow 3)
-- ----------------------------------------------------------------------------
-- close_ride() sets rides.status = 'ended', but `rides` was not in the
-- supabase_realtime publication, so members were never notified when the lead
-- ended the ride. Publish it so the live views can react to status changes.
-- Additive; safe to re-run (guarded).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides'
  ) then
    alter publication supabase_realtime add table rides;
  end if;
end $$;
