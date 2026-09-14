-- ============================================================================
-- 0017 — Persistent rider groups (Groups tab)
-- ----------------------------------------------------------------------------
-- A ride_group is a long-lived crew that plans rides together repeatedly
-- (unlike a ride, which is one trip). Creation is a multi-step client wizard:
-- name, city, ride culture, tagline, rules, and one or more leads. Leads can
-- add/remove members and promote/demote other leads.
--
-- Follows 0001 conventions: uuid PKs, updated_at trigger, RLS on, membership
-- helpers are SECURITY DEFINER so policies don't recurse.
-- ============================================================================

create type group_member_role as enum ('lead', 'member');

create table ride_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text,
  culture    text,               -- "describe the ride culture you want"
  tagline    text,
  rules      text,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ride_groups_set_updated_at before update on ride_groups
  for each row execute function set_updated_at();

create table ride_group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references ride_groups (id) on delete cascade,
  user_id   uuid not null references profiles (id) on delete cascade,
  role      group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index ride_group_members_group_idx on ride_group_members (group_id);
create index ride_group_members_user_idx on ride_group_members (user_id);

-- Membership helpers (SECURITY DEFINER so RLS policies don't recurse).
create or replace function is_group_member(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from ride_group_members m
    where m.group_id = gid and m.user_id = auth.uid()
  );
$$;

create or replace function is_group_lead(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from ride_group_members m
    where m.group_id = gid and m.user_id = auth.uid() and m.role = 'lead'
  );
$$;

-- True when the current user shares any group with `other` — extends profile
-- reads to group rosters the same way shares_ride_with() does for rides.
create or replace function shares_group_with(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from ride_group_members me
    join ride_group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and them.user_id = other
  );
$$;

-- Atomic group creation: the group row, the creator as its first lead, and
-- any co-leads picked in the wizard — all in one transaction. Co-lead ids are
-- ignored silently if they duplicate the creator or don't exist (the wizard
-- only offers real profile ids from search_riders).
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

  insert into ride_groups (name, city, culture, tagline, rules, created_by)
  values (btrim(p_name), nullif(btrim(p_city), ''), nullif(btrim(p_culture), ''),
          nullif(btrim(p_tagline), ''), nullif(btrim(p_rules), ''), auth.uid())
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

-- Name search so leads can find riders to add. profiles RLS only exposes your
-- own row plus ride/group co-members, so discovery needs a SECURITY DEFINER
-- seam (returns the same fields a roster row shows — no private data).
create or replace function search_riders(p_query text)
returns table (id uuid, display_name text, avatar_url text)
language sql security definer stable set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from profiles p
  where p.display_name ilike '%' || p_query || '%'
  order by p.display_name
  limit 8;
$$;

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table ride_groups enable row level security;
alter table ride_group_members enable row level security;

-- ride_groups: members read; anyone signed in creates their own; leads update.
create policy ride_groups_select on ride_groups
  for select using (is_group_member(id) or created_by = auth.uid());
create policy ride_groups_insert on ride_groups
  for insert with check (created_by = auth.uid());
create policy ride_groups_update on ride_groups
  for update using (is_group_lead(id));

-- ride_group_members: members read the roster; leads add/remove/promote. A
-- member can always remove their own row (leave the group). NOTE: nothing
-- stops the last lead leaving — acceptable for the demo, revisit with an
-- ownership-transfer rule later.
create policy ride_group_members_select on ride_group_members
  for select using (is_group_member(group_id));
create policy ride_group_members_insert on ride_group_members
  for insert with check (is_group_lead(group_id));
create policy ride_group_members_update on ride_group_members
  for update using (is_group_lead(group_id));
create policy ride_group_members_delete on ride_group_members
  for delete using (is_group_lead(group_id) or user_id = auth.uid());

-- Group co-members can read each other's profile rows (roster names/avatars).
create policy profiles_select_group on profiles
  for select using (shares_group_with(id));
