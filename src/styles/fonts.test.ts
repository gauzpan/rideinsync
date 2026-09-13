import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// npm test runs from the repo root, so cwd is the repo root.
const repo = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(repo, rel), "utf8");

const fontsCss = read("design/tokens/fonts.css");
const typographyCss = read("design/tokens/typography.css");

test("fonts.css declares a Roadspur Display @font-face pointing at the self-hosted woff", () => {
  // @font-face block for the brand family exists.
  assert.match(
    fontsCss,
    /@font-face\s*\{[^}]*font-family:\s*"Roadspur Display"[^}]*\}/,
    "expected an @font-face for \"Roadspur Display\"",
  );
  // src points at the woff we ship.
  assert.match(
    fontsCss,
    /url\(["']?\/fonts\/roadspur-display\.woff["']?\)\s*format\(["']woff["']\)/,
    "@font-face src must load /fonts/roadspur-display.woff as format(woff)",
  );
});

test("Poppins is no longer imported and Inter is kept", () => {
  // Only the @import line matters — Poppins must not be a requested family.
  const imports = fontsCss.match(/@import[^;]+;/g)?.join("\n") ?? "";
  assert.ok(!/Poppins/i.test(imports), "Poppins must not be imported any more");
  assert.match(imports, /family=Inter/, "Inter must still be imported");
});

test("--font-brand leads with Roadspur Display", () => {
  const match = typographyCss.match(/--font-brand\s*:\s*([^;]+);/);
  assert.ok(match, "--font-brand token must be defined");
  assert.match(
    match![1].trim(),
    /^"Roadspur Display"/,
    "--font-brand must start with \"Roadspur Display\"",
  );
});

test("the woff file exists and is a reasonable size (< 120 KB)", () => {
  const woff = path.join(repo, "public/fonts/roadspur-display.woff");
  assert.ok(fs.existsSync(woff), "public/fonts/roadspur-display.woff must exist");
  const bytes = fs.statSync(woff).size;
  assert.ok(bytes > 0, "woff must not be empty");
  assert.ok(bytes < 120 * 1024, `woff should be < 120 KB, got ${bytes} bytes`);
});
