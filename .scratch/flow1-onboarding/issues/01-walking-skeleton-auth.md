# 01: Walking skeleton — auth (Google + guest) + shared enablers

**What to build:** A running app where a user can sign in with Google or as a guest and end up with a profile, plus the shared prefactors every later ticket needs. This is the tracer bullet for the auth path end-to-end (sign-in UI → session service → Supabase auth → `profiles` row via the DB trigger).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `npm run build` and `npm run dev` succeed.
- [ ] A sign-in sheet offers "Continue with Google" and "Continue as guest" (design-system styled, tokens only).
- [ ] Google sign-in and guest (anonymous) sign-in each establish a Supabase session; a `profiles` row exists for the signed-in user (created by the existing `handle_new_user()` trigger).
- [ ] Session persists across reload; the app recognises a signed-in user vs a signed-out one.
- [ ] `Input`, `SegmentedControl`, and `Stepper` primitives are ported from `design/components/**` into `src/components/ui/` as TS, preserving prop contracts and visual spec (tokens only, no raw hex/px/fonts).
- [ ] Auth/session and share/clipboard are accessed through thin service-module wrappers (per decision D18), not browser APIs called inline in components.
- [ ] Depends on the one-time backend enablers being done (keys in `.env.local`, `0001` migration applied, Google + anonymous auth enabled) — verify the app authenticates against the live project.
