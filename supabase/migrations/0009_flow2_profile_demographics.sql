-- ============================================================================
-- Flow 2 — Profile demographics (first_name, last_name, gender, age_band)
-- ----------------------------------------------------------------------------
-- Extends profiles table with personal details for emergency/medical ID.
-- Additive only (0001 untouched). display_name remains derived (First L. or First).
-- Owner-only RLS already applies to profiles rows; no RLS policy changes needed.
-- ============================================================================

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text,
  add column if not exists gender     text check (gender is null or gender in ('male', 'female', 'non_binary', 'prefer_not_to_say')),
  add column if not exists age_band   text check (age_band is null or age_band in ('18_25', '26_35', '36_45', '46_55', '56_plus'));