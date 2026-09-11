# 08: Rich profile — medical, driving licence, avatar, vehicle characteristics

**What to build:** The optional, skippable profile fields that deepen safety and identification but never gate joining. Spec marks these post-demo; deferrable.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] A rider can add a full medical profile (blood type, allergies, medications, notes) → `medical_profiles`.
- [ ] A rider can upload a driving-licence document to Supabase Storage; a `documents` row records the type + storage path (owner-only RLS).
- [ ] A rider can set an avatar and add vehicle make/model/colour on top of the required registration number.
- [ ] All of these are optional and skippable — skipping never blocks joining a ride; they are completable during onboarding or later from the dashboard (Flow 2).
- [ ] Owner-only visibility is respected for medical and documents (no group-wide exposure; lead/sweep access is a Flow 5 concern).
- [ ] `npm run build` succeeds; changes reviewed and committed.
