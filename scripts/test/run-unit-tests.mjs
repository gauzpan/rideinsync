// Repo unit-test runner. Bundles every src/**/*.test.ts with esbuild (already a
// transitive dependency — nothing is installed), aliasing ./supabase to a
// controllable mock and defining Vite's import.meta.env, then runs the bundles
// under Node's built-in test runner. Usage: `npm test`.
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const mock = path.join(here, "supabaseMock.ts");
const esbuild = (await import(pathToFileURL(path.join(repo, "node_modules/esbuild/lib/main.js")).href)).default;

// Recursively collect files matching a pattern.
function collect(dir, pattern, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collect(full, pattern, out);
    else if (pattern.test(e.name)) out.push(full);
  }
  return out;
}

const tests = collect(path.join(repo, "src"), /\.test\.tsx?$/);
if (tests.length === 0) {
  console.error("No src/**/*.test.ts files found.");
  process.exit(1);
}

// Keep the transient bundles on the same drive as the repo (never C:).
const cacheBase = path.join(repo, "node_modules", ".cache");
fs.mkdirSync(cacheBase, { recursive: true });
const outdir = fs.mkdtempSync(path.join(cacheBase, "rideinsync-tests-"));

const aliasSupabase = {
  name: "alias-supabase",
  setup(build) {
    // Any import that resolves to the app's supabase client -> the mock.
    build.onResolve({ filter: /(^|\/)supabase$/ }, (args) => {
      if (args.path.endsWith("supabase")) return { path: mock };
      return null;
    });
  },
};

try {
  await esbuild.build({
    entryPoints: tests,
    bundle: true,
    outdir,
    platform: "node",
    format: "esm",
    target: "node20",
    outExtension: { ".js": ".mjs" },
    define: { "import.meta.env": "{}" },
    plugins: [aliasSupabase],
    logLevel: "warning",
  });

  const bundles = collect(outdir, /\.mjs$/);
  const res = spawnSync(process.execPath, ["--test", ...bundles], { stdio: "inherit" });
  process.exitCode = res.status ?? 1;
} finally {
  fs.rmSync(outdir, { recursive: true, force: true });
}
