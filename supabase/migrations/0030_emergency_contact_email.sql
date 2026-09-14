-- Emergency-contact email — founder request: when a rider records an emergency
-- contact, also capture that contact's email so a raised SOS can notify them by
-- email as well (supabase/functions/send-sos-email). Nullable and optional:
-- existing rows and the join-time minimum-profile flow keep working unchanged.
--
-- RLS: the emergency_contacts_owner policy (0001_foundation.sql) is FOR ALL over
-- the whole row (using/with check user_id = auth.uid()), so it already governs
-- the new column — no policy change is needed.
--
-- The CHECK is a coarse structural backstop only (defence in depth). The client
-- (src/lib/sosEmail.ts: normalizeEmail + isValidEmail) trims, lowercases and
-- validates before writing; this guard just rejects an obviously malformed
-- non-null value (must contain no whitespace, exactly the local@domain.tld
-- shape). Kept permissive so a legitimate address is never rejected at the DB.
alter table emergency_contacts
  add column email text
    check (
      email is null
      or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    );

comment on column emergency_contacts.email is
  'Optional email of the emergency contact; used by send-sos-email to notify them when an SOS is raised. Validated/normalised client-side (src/lib/sosEmail.ts).';
