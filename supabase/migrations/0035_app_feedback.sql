-- ============================================================================
-- 0035 — App feedback / grievances (general, not tied to a ride)
-- ----------------------------------------------------------------------------
-- A lightweight channel for users to send free-text feedback from anywhere in
-- the app (home, post-ride, etc). Distinct from `ride_feedback`, which is the
-- per-ride post-trip survey. `user_name` is denormalised (a snapshot of the
-- submitter's display name) so grievances stay readable in the dashboard even
-- if the profile changes or the account is later removed.
-- ============================================================================

create table app_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles (id) on delete set null,
  user_name  text,
  message    text not null,
  context    text,                              -- where it was sent from: 'home', 'ride_end', …
  created_at timestamptz not null default now()
);

create index app_feedback_created_at_idx on app_feedback (created_at desc);

alter table app_feedback enable row level security;

-- Any signed-in user (including anonymous guests) can file their own feedback.
create policy app_feedback_insert_self on app_feedback
  for insert with check (user_id = auth.uid());

-- Users can read back only their own submissions; admin review happens via the
-- service role in the Supabase dashboard.
create policy app_feedback_select_self on app_feedback
  for select using (user_id = auth.uid());
