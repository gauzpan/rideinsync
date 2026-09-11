# 03: Rider joins by code and lands on ride detail

**What to build:** A second user joins an existing ride by typing its code, completes the minimum rider profile, and lands inside the ride. Completes the end-to-end lead↔rider walkthrough.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] A user can enter a join code and see a read-only ride preview (name, lead, route summary, timings, capacity).
- [ ] A first-time rider completes the minimum profile before joining: display name + 1 emergency contact + vehicle registration number. (Soft gate for the demo: warn but allow skip; conceptually required.)
- [ ] A returning rider skips profile entry — existing details are prefilled/reused.
- [ ] Joining goes through the `request_join_ride(code)` RPC; demo rides auto-approve and materialise a `ride_members` row.
- [ ] After joining, the rider lands on ride detail showing route, stops, guidelines, timings, and the roster (including themselves with their role).
- [ ] A repeat join by an existing member routes straight to ride detail (no duplicate).
- [ ] Minimum-profile writes land in `profiles`, `emergency_contacts`, and `vehicles` (reg number).
- [ ] `npm run build` succeeds; changes reviewed and committed.
