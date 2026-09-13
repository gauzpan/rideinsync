import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Reads global.css as text (no DOM in this runner) and asserts the "soft raised"
// depth tokens and the press-state rule the Button/Card/SOS components rely on.
const css = fs.readFileSync(
  path.join(process.cwd(), "src", "styles", "global.css"),
  "utf8",
);

const tokens = [
  "--shadow-raised",
  "--shadow-raised-accent",
  "--shadow-raised-danger",
  "--shadow-pressed",
  "--grad-surface",
  "--grad-accent",
  "--grad-danger",
  "--shadow-nav",
];

for (const name of tokens) {
  test(`global.css defines ${name}`, () => {
    assert.match(css, new RegExp(`${name}\\s*:`), `${name} token missing`);
  });
}

// The visible "edge" that sells the key-cap depth: primary/danger raised
// shadows carry a coloured hard 0 3px 0 layer (dark lime / dark red) rather
// than plain black, so the lit face and its edge read as one moulded piece.
test("--shadow-raised-accent uses the dark-lime hard edge", () => {
  assert.match(css, /--shadow-raised-accent[\s\S]*?0 3px 0 #7FA800/i, "accent edge missing");
});
test("--shadow-raised-danger uses the dark-red hard edge", () => {
  assert.match(css, /--shadow-raised-danger[\s\S]*?0 3px 0 #9E1F17/i, "danger edge missing");
});

test("global.css defines the .ui-raised press state", () => {
  assert.match(css, /\.ui-raised\b/, ".ui-raised class missing");
  assert.match(css, /\.ui-raised:active/, ".ui-raised:active rule missing");
  // Press-down must be a real 3px drop (was 1px) so the tap is felt at arm's length.
  assert.match(css, /\.ui-raised:active[\s\S]*?translateY\(3px\)/, "translateY(3px) press missing");
});
