-- ============================================================================
-- RideInSync — Demo seed (Flow 7 / GTM)
-- ----------------------------------------------------------------------------
-- One deterministic demo pod with a scripted GPS track, behind is_demo = true,
-- for investor/user walkthroughs and deterministic playback.
--
-- Applied automatically by `supabase db reset`. Idempotent-ish: uses fixed
-- UUIDs and ON CONFLICT DO NOTHING so re-running does not duplicate.
--
-- NOTE: inserts into auth.users so the handle_new_user() trigger provisions the
-- matching profiles rows. Demo accounts are not meant to be logged into.
-- ============================================================================

-- ---- Badge catalog (reference data; award criteria live in app logic) ------
insert into badges (key, name, description, icon) values
  ('first_ride', 'First Ride',   'Completed your first group ride.',        'flag'),
  ('century',    'Century',      'Covered 100 km in a single ride.',        'route'),
  ('safe_sweep', 'Safe Sweep',   'Rode sweep and brought everyone home.',   'shield'),
  ('trailblazer','Trailblazer',  'Led your first ride.',                    'chevrons')
on conflict (key) do nothing;

-- ---- Demo auth users (trigger creates profiles) ----------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'lead@demo.rideinsync', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Aarav (Lead)","is_guest":false}', false),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2',
   'authenticated', 'authenticated', 'sweep@demo.rideinsync', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Meera (Sweep)","is_guest":false}', false),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3',
   'authenticated', 'authenticated', 'rider1@demo.rideinsync', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Rohan","is_guest":false}', false),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4',
   'authenticated', 'authenticated', 'rider2@demo.rideinsync', crypt('demo-password', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Kavya","is_guest":false}', false)
on conflict (id) do nothing;

-- ---- Demo ride --------------------------------------------------------------
insert into rides
  (id, code, name, leader_id, city, start_point, destination, status,
   member_capacity, separation_distance_km, separation_time_seconds, is_demo)
values
  ('00000000-0000-0000-0000-0000000000b1', 'DEMO01', 'Nandi Hills Sunrise Run',
   '00000000-0000-0000-0000-0000000000a1', 'Bengaluru',
   '{"lat":12.9716,"lng":77.5946,"label":"MG Road"}',
   '{"lat":13.3702,"lng":77.6835,"label":"Nandi Hills"}',
   'active', 8, 2.0, 300, true)
on conflict (id) do nothing;

insert into route_stops (ride_id, seq, name, location, kind) values
  ('00000000-0000-0000-0000-0000000000b1', 1, 'Hebbal fuel stop', '{"lat":13.0358,"lng":77.5970}', 'fuel'),
  ('00000000-0000-0000-0000-0000000000b1', 2, 'Highway chai break', '{"lat":13.1986,"lng":77.6410}', 'rest')
on conflict (ride_id, seq) do nothing;

-- ---- Members: 1 lead, 1 sweep, 2 riders ------------------------------------
insert into ride_members (ride_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'leader', 'riding'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'sweep',  'riding'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'rider',  'riding'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4', 'rider',  'stopped')
on conflict (ride_id, user_id) do nothing;

-- ---- Scripted GPS track (latest ping per rider is the freshest row) ---------
-- Lead out front, rider a3 mid-pack, rider a4 stopped/behind, sweep at the tail.
insert into rider_positions (ride_id, user_id, lat, lng, heading, speed, recorded_at) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',13.0210,77.6010,15,52, now() - interval '90 seconds'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',13.0355,77.6060,14,55, now() - interval '30 seconds'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a3',13.0120,77.5980,16,48, now() - interval '75 seconds'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a3',13.0250,77.6020,15,50, now() - interval '25 seconds'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a4',12.9980,77.5955,0, 0,  now() - interval '210 seconds'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2',12.9990,77.5960,16,45, now() - interval '20 seconds');

-- ---- A couple of signals to render on the ops map ---------------------------
insert into ride_events (ride_id, user_id, type, payload) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a4','stop',
   '{"note":"fuel"}'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','pitstop',
   '{"location":{"lat":13.0358,"lng":77.5970},"note":"Regroup at Hebbal fuel"}');

insert into stoppage_reports (ride_id, user_id, reason) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a4','fuel');

-- ---- Baseline dashboard data ------------------------------------------------
-- Per-mode stats (0007 makes user_stats keyed by (user_id, mode)); demo is motorcycle.
insert into user_stats (user_id, mode, rides_completed, distance_m, rides_led) values
  ('00000000-0000-0000-0000-0000000000a1', 'motorcycle', 12, 1840000, 5),
  ('00000000-0000-0000-0000-0000000000a2', 'motorcycle', 8,  1220000, 0),
  ('00000000-0000-0000-0000-0000000000a3', 'motorcycle', 3,  410000,  0),
  ('00000000-0000-0000-0000-0000000000a4', 'motorcycle', 1,  120000,  0)
on conflict (user_id, mode) do nothing;

insert into user_badges (user_id, badge_key, ride_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'trailblazer', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a3', 'first_ride',  '00000000-0000-0000-0000-0000000000b1')
on conflict (user_id, badge_key) do nothing;
