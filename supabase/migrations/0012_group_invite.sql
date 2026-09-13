-- ============================================================================
-- 0012 — Group invite links
-- ----------------------------------------------------------------------------
-- Every ride_group gets a unique invite_code, shareable as a URL
-- (/groups/join/:code). Opening it while signed out routes through sign-in
-- first (see AppLayout's pending-group-join stash); opening it signed in
-- joins the group immediately via join_group_by_code, same shape as rides'
-- request_join_ride. No lead approval step for groups — anyone with the link
-- joins as a plain member right away.
-- ============================================================================

alter table ride_groups add column invite_code text unique;

-- Same alphabet as rides' generateJoinCode (src/services/onboardingService.ts)
-- minus 0/O/1/I — easy to read aloud. Generated server-side (unlike ride
-- codes) since create_ride_group already runs as one RPC transaction.
create or replace function generate_group_invite_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out_code text;
  i int;
begin
  loop
    out_code := '';
    for i in 1..6 loop
      out_code := out_code || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from ride_groups where invite_code = out_code);
  end loop;
  return out_code;
end;
$$;

create or replace function create_ride_group(
  p_name     text,
  p_city     text,
  p_culture  text,
  p_tagline  text,
  p_rules    text,
  p_co_leads uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'group name is required';
  end if;

  insert into ride_groups (name, city, culture, tagline, rules, created_by, invite_code)
  values (btrim(p_name), nullif(btrim(p_city), ''), nullif(btrim(p_culture), ''),
          nullif(btrim(p_tagline), ''), nullif(btrim(p_rules), ''), auth.uid(),
          generate_group_invite_code())
  returning id into gid;

  insert into ride_group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'lead');

  insert into ride_group_members (group_id, user_id, role)
  select gid, lead_id, 'lead'
  from unnest(p_co_leads) as lead_id
  where lead_id <> auth.uid()
    and exists (select 1 from profiles p where p.id = lead_id)
  on conflict (group_id, user_id) do nothing;

  return gid;
end;
$$;

-- Backfill invite codes for any group created before this migration.
update ride_groups set invite_code = generate_group_invite_code() where invite_code is null;

alter table ride_groups alter column invite_code set not null;

-- Joins the caller into the group the code points to, as a plain member.
-- SECURITY DEFINER: a non-member can't select ride_groups by invite_code
-- (RLS) and ride_group_members_insert requires is_group_lead — this seam
-- bypasses both intentionally, the same way request_join_ride does for rides.
create or replace function join_group_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  select id into gid from ride_groups where invite_code = upper(btrim(p_code));
  if gid is null then
    raise exception 'invalid invite code';
  end if;

  insert into ride_group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return gid;
end;
$$;
