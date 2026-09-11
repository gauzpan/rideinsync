-- ============================================================================
-- Flow 1 (Onboarding) — ticket 06: pillion join, linked to rider.
-- ----------------------------------------------------------------------------
-- Additive only: one new table. Does not ALTER any existing table (see
-- docs/DATA_MODEL.md — ride_members is a seam table other flows own/read).
--
-- A pillion is a first-class member with their own `ride_members` row (same
-- join path as a rider), so their emergency/medical data lives in the normal
-- owner-keyed tables. This table only records *which rider's bike* they're
-- on. Existence of a row here (keyed by pillion_user_id) is the "GPS
-- suppressed" signal: Flow 3 reads it to skip publishing/rendering a second
-- map dot for the pillion, so the map stays one dot per bike while the
-- roster/headcount (ride_members) still counts the pillion as a person.
-- ============================================================================

create table ride_pillion_links (
  id               uuid primary key default gen_random_uuid(),
  ride_id          uuid not null references rides (id) on delete cascade,
  pillion_user_id  uuid not null references profiles (id) on delete cascade,
  rider_user_id    uuid not null references profiles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (ride_id, pillion_user_id)   -- a person is one bike's pillion per ride
);
create index ride_pillion_links_ride_idx on ride_pillion_links (ride_id);
create index ride_pillion_links_rider_idx on ride_pillion_links (ride_id, rider_user_id);

alter table ride_pillion_links enable row level security;

-- Membership-scoped: any member of the ride can read the pairings (roster
-- display); a pillion writes only their own link, and only while they are
-- themselves a member of that ride (is_ride_member is defined in
-- 0001_foundation.sql).
create policy ride_pillion_links_select on ride_pillion_links
  for select using (is_ride_member(ride_id));

create policy ride_pillion_links_write_self on ride_pillion_links
  for all
  using (pillion_user_id = auth.uid())
  with check (pillion_user_id = auth.uid() and is_ride_member(ride_id));

comment on table ride_pillion_links is
  'Pairs a pillion (own ride_members row) with the rider whose bike they are on. Existence here is the GPS-suppressed flag Flow 3 reads to render one map dot per bike — see docs/flow1-onboarding-spec.md.';
