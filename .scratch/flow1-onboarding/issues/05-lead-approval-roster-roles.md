# 05: Lead approval, roster & role assignment

**What to build:** For non-demo rides, the lead controls who is in the ride and assigns Sweep/Co-lead from the roster.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] The lead sees a list of pending join requests for their ride (rider name, avatar, vehicle) and can approve or decline each (`approve_join_request` on approve).
- [ ] Approving materialises the rider's `ride_members` row; declining updates the request and is reflected to the rider.
- [ ] A roster view shows all current members with their roles.
- [ ] The lead can assign Sweep and Co-lead from the roster; the schema's one-leader/one-sweep constraint is respected (reassigning moves the role).
- [ ] A client-side "ride full" guard prevents approving members beyond `member_capacity` (hard DB enforcement is out of scope — foundation-owned).
- [ ] `npm run build` succeeds; changes reviewed and committed.
