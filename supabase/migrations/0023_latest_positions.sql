-- ============================================================================
-- M2 — hot/cold table split: latest_positions
-- ----------------------------------------------------------------------------
-- rider_positions (0001_foundation.sql) is append-only GPS history — every
-- accepted fix from every rider, forever (per ride). That's the right shape
-- for close_ride's distance calc and any post-hoc history view, but it's the
-- wrong shape for "where is everyone right now" — every consumer of live
-- position (the map, gap/separation checks) has to scan for each member's
-- most-recent row out of an ever-growing table.
--
-- latest_positions is the hot counterpart: exactly one row per (ride, rider),
-- upserted on every accepted ingest instead of appended. rider_positions
-- keeps existing for history/close_ride; this table is for "right now" reads.
-- The new positions-ingest Edge Function (supabase/functions/positions-ingest)
-- is what upserts this table (and samples into rider_positions alongside it).
--
-- Column set/types mirror rider_positions (0001_foundation.sql:162-172) for
-- the shared fields; PK is (ride_id, user_id) instead of a bigserial id,
-- since this table is one row per rider by design, not append-only.
-- ============================================================================
create table latest_positions (
  ride_id     uuid not null references rides (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  heading     double precision,
  speed       double precision,
  accuracy    double precision,
  recorded_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create trigger latest_positions_set_updated_at before update on latest_positions
  for each row execute function set_updated_at();

alter table latest_positions enable row level security;

-- Same shape as rider_positions' positions_select/positions_insert
-- (0001_foundation.sql:529-532), plus an UPDATE policy since this table is
-- upserted (one row per rider) rather than append-only — an upsert needs
-- both INSERT and UPDATE permission under RLS. The positions-ingest Edge
-- Function writes via the service-role key (RLS doesn't gate it there), but
-- these policies are added anyway for defense-in-depth / any future direct
-- client reads or writes of this table.
create policy latest_positions_select on latest_positions
  for select using (is_ride_member(ride_id));
create policy latest_positions_insert on latest_positions
  for insert with check (user_id = auth.uid() and is_ride_member(ride_id));
create policy latest_positions_update on latest_positions
  for update using (user_id = auth.uid() and is_ride_member(ride_id))
  with check (user_id = auth.uid() and is_ride_member(ride_id));
