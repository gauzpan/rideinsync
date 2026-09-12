import test from "node:test";
import assert from "node:assert/strict";
import { demoMyRides } from "./onboardingService";
import { DEMO_RIDE_ID } from "../lib/activeRide";

// The landing page (/) lists rides via getMyRides. In demo mode (no Supabase)
// it must resolve immediately to the one seed ride, self-consistent with Home's
// demoHomeData() — same id/name/role/rider-count — so `/` shows the ride card
// instead of hanging on "Loading your rides…".
test("demoMyRides returns the seed ride shaped as MyRideSummary", () => {
  const rows = demoMyRides();
  assert.equal(rows.length, 1, "exactly the one seed ride");
  const r = rows[0];
  assert.equal(r.rideId, DEMO_RIDE_ID, "same id as lib/activeRide + Home");
  assert.equal(r.name, "Nandi Hills Sunrise Run");
  assert.equal(r.status, "active");
  assert.equal(r.role, "leader");
  assert.equal(r.memberCount, 4);
  // Full MyRideSummary shape (fields the card reads / the type requires).
  assert.deepEqual(
    Object.keys(r).sort(),
    [
      "createdAt",
      "destinationLabel",
      "memberCount",
      "name",
      "rideId",
      "role",
      "scheduledEnd",
      "scheduledStart",
      "startLabel",
      "status",
    ],
  );
  assert.equal(typeof r.createdAt, "string");
  assert.equal(r.scheduledStart, null);
  assert.equal(r.scheduledEnd, null);
});
