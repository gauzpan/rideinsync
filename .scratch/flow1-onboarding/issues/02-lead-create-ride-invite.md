# 02: Lead creates a ride and gets an invite

**What to build:** A signed-in user creates one route-based ride and receives a shareable invite (code + link + QR) to hand to riders. End-to-end: create-ride form → persistence → invite screen.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] A signed-in Google user can create a ride with required name + start + destination, and optional stops (ordered, with kind fuel/food/rest/scenic), expected capacity, guidelines, permits, and fee.
- [ ] Start/destination/stops are captured as text labels and stored in the jsonb columns as `{ label }` — no Google Maps dependency (coordinates backfilled later by Flow 3).
- [ ] On create: a `rides` row is persisted (leader = current user, `status = draft`, a unique generated join `code`), a leader `ride_members` row, and any `route_stops`.
- [ ] Creating requires a real (Google) session; a guest is not allowed to create here (full guest→lead upgrade UX is ticket 07).
- [ ] The invite screen shows the join code, a shareable link (deep-link URL carrying the code), and a QR encoding that link; copy and share actions work (via the share service wrapper).
- [ ] `npm run build` succeeds; changes reviewed and committed.
