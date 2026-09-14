-- ============================================================================
-- 0013 — Seed the badge catalog (Flow 6 dependency)
-- ----------------------------------------------------------------------------
-- close_ride() (0011) awards badges, and user_badges.badge_key has a FK to
-- badges(key). The catalog was only in seed.sql, which isn't run on projects
-- that apply migrations only — so end-ride failed with a FK violation. Seed the
-- catalog as a migration so it's always present. Idempotent.
-- ============================================================================

insert into badges (key, name, description, icon) values
  ('first_ride', 'First Ride',  'Completed your first group ride.',       'flag'),
  ('century',    'Century',     'Covered 100 km in a single ride.',       'route'),
  ('safe_sweep', 'Safe Sweep',  'Rode sweep and brought everyone home.',  'shield')
on conflict (key) do nothing;
