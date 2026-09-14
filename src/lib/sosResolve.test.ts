import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSosResolutionLog, canResolveSos } from "./sos";

// Ops crew (leader / co-lead / sweep) may resolve another rider's SOS from
// the live ride view. Plain riders may not — RLS (0028_sos_resolve_ops.sql)
// enforces the same rule server-side.
test("canResolveSos allows leader, co-lead and sweep only", () => {
  assert.equal(canResolveSos("leader"), true);
  assert.equal(canResolveSos("co_leader"), true);
  assert.equal(canResolveSos("sweep"), true);
  assert.equal(canResolveSos("rider"), false);
  assert.equal(canResolveSos(null), false);
  assert.equal(canResolveSos(undefined), false);
  assert.equal(canResolveSos(""), false);
});

// The resolution audit must carry the timestamp, the ride id, and the SOS
// rider's details (plus the resolver) into both the console log and the
// ride_events row.
test("buildSosResolutionLog stamps the audit record", () => {
  const log = buildSosResolutionLog({
    alertId: "alert-1",
    rideId: "ride-1",
    riderUserId: "rider-1",
    riderName: "Aarav",
    riderTriggeredAt: "2026-09-14T10:00:00.000Z",
    resolverUserId: "lead-1",
    resolvedAt: "2026-09-14T10:05:00.000Z",
  });
  assert.equal(log.resolvedAt, "2026-09-14T10:05:00.000Z");
  assert.deepEqual(log.eventPayload, {
    action: "sos_resolved",
    alert_id: "alert-1",
    resolved_at: "2026-09-14T10:05:00.000Z",
    resolved_by: "lead-1",
    rider: {
      user_id: "rider-1",
      name: "Aarav",
      triggered_at: "2026-09-14T10:00:00.000Z",
    },
  });
});

test("buildSosResolutionLog defaults resolvedAt to now", () => {
  const before = Date.now();
  const log = buildSosResolutionLog({
    alertId: "alert-1",
    rideId: "ride-1",
    riderUserId: "rider-1",
    riderName: "Aarav",
    riderTriggeredAt: "2026-09-14T10:00:00.000Z",
    resolverUserId: "lead-1",
  });
  const stamped = Date.parse(log.resolvedAt);
  assert.ok(stamped >= before && stamped <= Date.now(), "resolvedAt must be ~now");
  assert.equal(log.eventPayload.resolved_at, log.resolvedAt);
});
