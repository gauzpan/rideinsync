import test from "node:test";
import assert from "node:assert/strict";
import { demoHomeData } from "./useHomeData";
import { DEMO_RIDE_ID } from "../lib/activeRide";

// Demo mode must be self-consistent with lib/activeRide (which short-circuits to
// the seed ride so the SOS button shows): Home must resolve immediately to the
// seed ride as the active ride card, never hang on "Loading your rides...".
test("demoHomeData resolves immediately to the seed ride", () => {
  const d = demoHomeData();
  assert.equal(d.loading, false, "must not hang loading");
  assert.equal(d.isEmpty, false, "seed ride means Home is not empty");
  assert.ok(d.activeRide, "active ride card must be present");
  assert.equal(d.activeRide.id, DEMO_RIDE_ID, "same id as lib/activeRide");
  assert.equal(d.activeRide.name, "Nandi Hills Sunrise Run");
  assert.equal(d.activeRide.code, "DEMO01");
  assert.deepEqual(d.pastRides, []);
});
