-- ============================================================================
-- Flow 1 (Onboarding) — ticket 08: rich profile (medical, driving licence,
-- avatar, vehicle characteristics).
-- ----------------------------------------------------------------------------
-- No new tables — `medical_profiles`, `vehicles`, `documents` already exist
-- in 0001_foundation.sql with owner-only RLS. This migration only adds the
-- Supabase Storage buckets those uploads land in, plus owner-scoped storage
-- policies (additive; does not ALTER any existing table).
--
-- - `avatars`   — public-read bucket (avatars are shown to fellow ride
--                 members in the roster), owner-only write.
-- - `documents` — private bucket for the driving-licence upload; owner-only
--                 read/write, matching the `documents` table's RLS so a
--                 rider's licence is never group-visible (lead/sweep access
--                 is a Flow 5 concern per docs/DATA_MODEL.md).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- avatars: anyone can view (public bucket + explicit select policy so
-- authenticated in-app fetches work identically to the public CDN URL);
-- only the uploader can write/replace/remove their own file.
create policy avatars_select_public on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and owner = auth.uid());

create policy avatars_update_own on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and owner = auth.uid());

create policy avatars_delete_own on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and owner = auth.uid());

-- documents: owner-only in every direction — no group-wide exposure.
create policy documents_owner_all on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and owner = auth.uid())
  with check (bucket_id = 'documents' and owner = auth.uid());
