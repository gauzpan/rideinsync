import { test } from "node:test";
import assert from "node:assert/strict";
import { iconLayers, type IconName } from "./Icon";
import { TAB_ICON_FILL } from "./TabBar";

// The glyphs the tab bar renders (Home / Ride / Groups / Discover), plus
// "user" — still exercised here since it's the AccountBar's avatar glyph.
const NAV_ICONS: IconName[] = ["home", "map", "users", "compass", "user"];

test("iconLayers without a fill returns the raw stroke paths (default unchanged)", () => {
  for (const name of NAV_ICONS) {
    const layers = iconLayers(name);
    assert.ok(layers.length > 0, `${name} should have path data`);
    // No injected fill layer when fill is omitted.
    assert.ok(!/stroke="none"/.test(layers), `${name} must stay stroke-only by default`);
  }
});

test("iconLayers with the tab-bar fill renders a translucent fill layer beneath the stroke layer", () => {
  for (const name of NAV_ICONS) {
    const layers = iconLayers(name, { fill: TAB_ICON_FILL });
    // A fill layer: the fill colour applied with no stroke.
    assert.ok(layers.includes(`fill="${TAB_ICON_FILL}"`), `${name} must carry the fill colour`);
    assert.ok(/stroke="none"/.test(layers), `${name} fill layer must disable stroke`);
    // The stroke layer (raw geometry) is still present after the fill layer,
    // so the outline draws on top.
    const strokeOnly = iconLayers(name);
    assert.ok(layers.endsWith(strokeOnly), `${name} stroke layer must sit on top of the fill layer`);
    assert.ok(
      layers.indexOf(`fill="${TAB_ICON_FILL}"`) < layers.lastIndexOf(strokeOnly),
      `${name} fill layer must come before the stroke layer`,
    );
  }
});
