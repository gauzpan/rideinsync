# 06: Pillion join — own account, linked to rider, single dot

**What to build:** A two-up passenger joins with their own account, records their own safety info, and links to the rider whose bike they're on. Headcount counts people; the map stays one dot per bike.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] An additive migration `000N_flow1.sql` creates `ride_pillion_links (ride_id, pillion_user_id, rider_user_id, unique(ride_id, pillion_user_id))` with membership-scoped RLS (members read; a pillion writes only their own link). `0001_foundation.sql` is not edited.
- [ ] The join flow offers a "riding my own bike / riding pillion" branch that routes required fields.
- [ ] A pillion completes a no-vehicle minimum profile (name + 1 emergency contact) and picks the rider they're with from the ride's joined roster; a `ride_pillion_links` row is written.
- [ ] The roster and headcount include the pillion, shown paired with their rider; the pillion is flagged as GPS-suppressed in the data (Flow 3 consumes this to render one dot per bike — cross-flow, not built here).
- [ ] If the chosen rider has not yet joined, the pillion sees a clear "ask your rider to join first" state.
- [ ] `npm run build` succeeds; changes reviewed and committed.
