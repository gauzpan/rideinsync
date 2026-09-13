import { test } from "node:test";
import assert from "node:assert/strict";
import { backLinkStyle } from "./BackLink";

// Pure seam: the shared chip style must carry the raised pill treatment.
// react-router's <Link> can't render here (no DOM), so we assert the style
// object instead of the rendered element.
test("backLinkStyle is a compact raised pill chip", () => {
  assert.equal(backLinkStyle.height, 32, "chip height stays 32px");
  assert.equal(backLinkStyle.borderRadius, "var(--radius-full)", "fully rounded pill");
  assert.equal(backLinkStyle.display, "inline-flex", "chevron + label sit inline");
  assert.ok(
    String(backLinkStyle.boxShadow).includes("shadow-raised"),
    "uses the shared --shadow-raised token so it matches buttons/cards",
  );
});
