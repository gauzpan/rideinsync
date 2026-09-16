import { test } from "node:test";
import assert from "node:assert/strict";
// Locks the pure decision behind the "sync SOS" voice command: it must open
// /sos with { auto: true } (so SosPage runs its 5s countdown + auto-send) from
// anywhere but the /sos screen itself, where there is nothing extra to do.
import { voiceSosNavigation } from "../AppLayout";

test("voice SOS from home → navigate to /sos with auto: true", () => {
  assert.deepEqual(voiceSosNavigation("/home"), { to: "/sos", state: { auto: true } });
});

test("voice SOS from the ride view → navigate to /sos with auto: true", () => {
  assert.deepEqual(voiceSosNavigation("/ride/abc123"), { to: "/sos", state: { auto: true } });
});

test("voice SOS while already on /sos → do nothing (null)", () => {
  assert.equal(voiceSosNavigation("/sos"), null);
});

test("voice SOS on a nested /sos path is also a no-op", () => {
  assert.equal(voiceSosNavigation("/sos/confirm"), null);
});
