-- Flow 5 SOS: who is responding to an alert. ride_id denormalised so realtime can filter by ride.
create table sos_responses (
  id         uuid primary key default gen_random_uuid(),
  alert_id   uuid not null references sos_alerts (id) on delete cascade,
  ride_id    uuid not null references rides (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  reached_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (alert_id, user_id)
);
create index sos_responses_alert_idx on sos_responses (alert_id, created_at);
alter table sos_responses enable row level security;
create policy sos_responses_select on sos_responses for select using (is_ride_member(ride_id));
create policy sos_responses_insert on sos_responses for insert with check (user_id = auth.uid() and is_ride_member(ride_id));
-- Increment 2: a responder marks their own response as reached.
create policy sos_responses_update_own on sos_responses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table sos_responses;

-- Increment 2: only the rider in distress can resolve (close) their own alert.
create policy sos_alerts_resolve_own on sos_alerts for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Increment 4: rider taps "Stay" (still needs help) after a responder reached them.
-- The rider's own update is already permitted by sos_alerts_resolve_own above.
alter table sos_alerts add column stay_requested_at timestamptz null;

-- Increment 2: full row images so realtime UPDATE events carry ride_id for the filter.
alter table sos_responses replica identity full;
alter table sos_alerts replica identity full;
