-- ============================================================================
-- Push notifications (0015) — Flow 4 "notifications" first cut, per
-- PRD/signals_haptics_plan.md §7a/§8/§10. Stores one row per (user, ride,
-- device) subscription; the actual send happens in the push-notify Edge
-- Function (supabase/functions/push-notify), invoked directly by the client
-- right after a ride_events/sos_alerts insert (src/lib/pushNotifications.ts)
-- rather than a pg_net database trigger — avoids needing custom GUC secrets
-- for a hackathon-scale first cut; a trigger-based path is a reasonable v2 if
-- "never rely on the client" becomes a hard requirement later.
-- ============================================================================

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  ride_id    uuid not null references rides (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, ride_id, endpoint)
);
create index push_subscriptions_ride_idx on push_subscriptions (ride_id);

alter table push_subscriptions enable row level security;

-- Owner reads/writes their own subscription rows only — same "owner" pattern
-- as emergency_contacts_owner etc. in 0001_foundation.sql. The push-notify
-- Edge Function reads across users via the service-role key, which bypasses
-- RLS entirely, so no separate "read all ride subscribers" policy is needed.
create policy push_subscriptions_owner on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
