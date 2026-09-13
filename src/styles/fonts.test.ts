import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// npm test runs from the repo root, so cwd is the repo root.
const repo = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(repo, rel), "utf8");

const fontsCss = read("design/tokens/fonts.css");
const typographyCss = read("design/tokens/typography.css");

test("fonts.css imports Bricolage Grotesque", () => {
  const imports = fontsCss.match(/@import[^;]+;/g)?.join("\n") ?? "";
  assert.match(imports, /family=Bricolage\+Grotesque/, "Bricolage Grotesque must be imported");
});

test("Poppins and Inter are no longer imported from Google Fonts", () => {
  // Bricolage Grotesque covers both the brand and UI roles now — see
  // design/tokens/fonts.css. Poppins/Inter may still appear as fallback
  // families in typography.css, just not as separate @import requests.
  const imports = fontsCss.match(/@import[^;]+;/g)?.join("\n") ?? "";
  assert.ok(!/family=Poppins/i.test(imports), "Poppins must not be imported any more");
  assert.ok(!/family=Inter/i.test(imports), "Inter must not be imported any more");
});

test("--font-brand and --font-ui lead with Bricolage Grotesque", () => {
  const brandMatch = typographyCss.match(/--font-brand\s*:\s*([^;]+);/);
  assert.ok(brandMatch, "--font-brand token must be defined");
  assert.match(
    brandMatch![1].trim(),
    /^"Bricolage Grotesque"/,
    '--font-brand must start with "Bricolage Grotesque"',
  );

  const uiMatch = typographyCss.match(/--font-ui\s*:\s*([^;]+);/);
  assert.ok(uiMatch, "--font-ui token must be defined");
  assert.match(
    uiMatch![1].trim(),
    /^"Bricolage Grotesque"/,
    '--font-ui must start with "Bricolage Grotesque"',
  );
});

test("--weight-bold is defined for headings that need more separation than semibold", () => {
  assert.match(typographyCss, /--weight-bold\s*:\s*700\s*;/, "--weight-bold token must be 700");
});
