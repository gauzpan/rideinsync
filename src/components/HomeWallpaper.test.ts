import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowWallpaper } from "./HomeWallpaper.tsx";

// The wallpaper shows on every screen except the SOS screen.
for (const p of [
  "/",
  "/home",
  "/discover",
  "/ride/create",
  "/join",
  "/profile",
  "/ride/x",
  "/ride/x/lead",
]) {
  test(`shouldShowWallpaper: ${p} shows the wallpaper`, () => {
    assert.equal(shouldShowWallpaper(p), true);
  });
}

// The SOS screen and any of its sub-routes must stay on a plain surface.
for (const p of ["/sos", "/sos/anything", "/sos/123/confirm"]) {
  test(`shouldShowWallpaper: ${p} is hidden`, () => {
    assert.equal(shouldShowWallpaper(p), false);
  });
}
