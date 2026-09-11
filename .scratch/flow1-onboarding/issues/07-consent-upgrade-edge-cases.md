# 07: Consent, guest→lead upgrade, and join edge cases

**What to build:** The correctness and compliance layer — record consent, let a guest upgrade to lead, and handle the join edge cases cleanly.

**Blocked by:** 03, 05.

**Status:** ready-for-agent

- [ ] A consent checkbox at profile creation writes a `consent_records` row (policy `dpdp`/`tnc`, a version string). Full policy copy is out of scope.
- [ ] A guest tapping "Start a ride" is prompted to continue with Google, with a one-line reason; on success they proceed into create-ride with their data carried over.
- [ ] Edge cases handled with clear UI: invalid or ended join code; already-a-member → straight to ride detail; ride full → blocked with a message.
- [ ] A rider can withdraw a pending join request, and can leave a ride they joined before it starts (deletes their own `ride_members` row via write-self RLS). Mid-ride leaving is out of scope (Flow 3/4).
- [ ] `npm run build` succeeds; changes reviewed and committed.
