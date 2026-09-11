-- ============================================================================
-- Flow 1 (Onboarding) — ticket 07: consent, guest→lead upgrade, join edge
-- cases.
-- ----------------------------------------------------------------------------
-- Additive only: one new RLS policy. Does not ALTER any existing table.
--
-- consent_records already exists with an owner-all policy (0001_foundation.sql)
-- so no schema change is needed there — the join flow writes it directly.
--
-- ride_join_requests, however, only has SELECT + INSERT policies for the
-- requester (0001_foundation.sql: join_requests_select, join_requests_insert_self).
-- A rider withdrawing a pending request needs to delete their own row, which
-- has no policy to permit it yet.
-- ============================================================================

create policy join_requests_delete_self_pending on ride_join_requests
  for delete
  using (user_id = auth.uid() and status = 'pending');

comment on policy join_requests_delete_self_pending on ride_join_requests is
  'A rider can withdraw their own pending join request. Decided (approved/rejected) requests are left as an audit trail.';
