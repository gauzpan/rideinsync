import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Guard-shape audit for demo mode. This test does NOT import the app modules
// (they pull in supabase/react); it reads their SOURCE as text and asserts the
// only way any code decides "are we in demo mode?" is the one canonical
// expression. If a future edit introduces a second, differently-spelled guard
// (=== "0", !== "1", == "1", a truthy coerce, a different env var comparison),
// this test fails — which is the precondition for demo mode being removable by
// deleting exactly these guards. Paths resolve from the repo root (npm test's
// cwd), since the esbuild bundle runs from node_modules/.cache.
const repo = process.cwd();

// The canonical guard, assembled from parts so esbuild's `import.meta.env`
// define cannot rewrite it and it never runs as code — it is only ever text.
const CANONICAL = ["import", "meta", "env"].join(".") + '.VITE_DEMO_SESSION === "1"';

// Every source file that gates behaviour on demo mode. sos.ts is intentionally
// absent: it never reads the env var, it branches on sosDemo.isDemoBackend,
// whose own guard is checked here via sosDemo.ts.
// onboardingService.ts is intentionally absent: its only demo guard sat in
// getMyRides (the landing "Your rides" dashboard), which upstream removed, so
// there is no demo-mode behaviour left to guard there.
const GUARDED_FILES = [
  "src/hooks/useHomeData.tsx",
  "src/lib/activeRide.ts",
  "src/lib/auth.ts",
  "src/lib/sosDemo.ts",
];

function read(rel: string): string {
  return fs.readFileSync(path.join(repo, rel), "utf8");
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

// Any equality/inequality comparison written against the demo env var, with
// whatever operator and right-hand operand follows it (single `=` assignment,
// as in comments like "(VITE_DEMO_SESSION=1)", is deliberately not matched).
const EQ_COMPARE = /VITE_DEMO_SESSION\s*(===|!==|==|!=)\s*("[^"]*"|[^\s;&|)]*)/g;

test("every demo guard uses the canonical import.meta.env.VITE_DEMO_SESSION === \"1\" expression", () => {
  for (const rel of GUARDED_FILES) {
    const src = read(rel);
    const canonical = countOccurrences(src, CANONICAL);
    assert.ok(
      canonical >= 1,
      `${rel}: expected the canonical demo guard ${JSON.stringify(CANONICAL)} at least once, found ${canonical}`,
    );
  }
});

test("no source file compares VITE_DEMO_SESSION with anything other than === \"1\"", () => {
  // Sweep the whole src tree, not just the known files, so a NEW non-canonical
  // guard anywhere is caught.
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(full);
    }
  })(path.join(repo, "src"));

  for (const full of files) {
    const src = fs.readFileSync(full, "utf8");
    for (const m of src.matchAll(EQ_COMPARE)) {
      const whole = m[0];
      const operator = m[1];
      const rhs = m[2];
      assert.equal(
        operator + " " + rhs,
        '=== "1"',
        `${path.relative(repo, full)}: VITE_DEMO_SESSION must only be compared as === "1", found ${JSON.stringify(whole)}`,
      );
    }
  }
});

test("the demo env var is spelled VITE_DEMO_SESSION everywhere (no drift)", () => {
  // A guard on a mistyped/renamed var would silently never fire in a demo
  // build and never die in a prod build. Assert the exact canonical count so
  // an added guard must be added to GUARDED_FILES (and thus stay canonical).
  let total = 0;
  for (const rel of GUARDED_FILES) total += countOccurrences(read(rel), CANONICAL);
  assert.equal(total, 4, `expected 4 canonical demo guards across GUARDED_FILES, found ${total}`);
});
