/**
 * Deploy backend + frontend to a Convex *preview* deployment.
 *
 *   CONVEX_DEPLOY_KEY=<preview deploy key> npm run deploy:preview -- <name> [--fresh] [--no-setup]
 *
 * Reuses the preview of that name if there is one (same URL, data kept); --fresh deletes and
 * recreates it. --no-setup skips setup:init.
 *
 * `static-hosting deploy` and `static-hosting upload --prod` only know the dev and production
 * deployments: every `convex run` they issue is either bare or carries `--prod`, and with a preview
 * deploy key a bare `convex run` is rejected ("Not authorized") because the key names a project, not
 * a deployment. So this script does the three steps itself and, for the upload, runs the hosting
 * CLI from a scratch directory whose `convex` package is a shim that forwards to the real CLI with
 * `--preview-name <name>` appended. Nothing here can reach production.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(join(root, "package.json"));
const convexBin = join(dirname(require.resolve("convex/package.json")), "bin", "main.js");
const hostingBin = join(
  dirname(require.resolve("@convex-dev/static-hosting/package.json")),
  "dist", "cli", "index.js",
);

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const runSetup = !args.includes("--no-setup");
const fresh = args.includes("--fresh");

if (!name) fail("Usage: npm run deploy:preview -- <preview-name> [--fresh] [--no-setup]");
if (!process.env.CONVEX_DEPLOY_KEY?.startsWith("preview:")) {
  fail("CONVEX_DEPLOY_KEY must be a preview deploy key (it starts with \"preview:\").");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(command: string, argv: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const res = spawnSync(command, argv, { stdio: "inherit", cwd: opts.cwd ?? root, env: opts.env ?? process.env });
  if (res.status !== 0) fail(`\n${[command, ...argv].join(" ")} exited with ${res.status}`);
}

// 1. Backend. setup:init is idempotent, so it is safe to re-run on an existing preview.
console.log(`\n▸ Deploying backend to preview "${name}"`);
run(process.execPath, [
  convexBin, "deploy", fresh ? "--preview-create" : "--preview-name", name!,
  ...(runSetup ? ["--preview-run", "setup:init"] : []),
]);

// 2. Ask the hosting component on that preview where it lives, and build against it.
const urls = JSON.parse(
  execFileSync(process.execPath, [
    convexBin, "run", "--preview-name", name!, "--component", "staticHosting",
    "lib:getUrls", "{}", "--typecheck=disable", "--codegen=disable",
  ], { cwd: root, encoding: "utf-8" }),
) as { cloudUrl: string; siteUrl: string };

console.log(`\n▸ Building frontend for ${urls.cloudUrl}`);
run("npm", ["run", "build"], {
  env: {
    ...process.env,
    VITE_CONVEX_URL: urls.cloudUrl,
    STATIC_HOSTING_BASE_PATH: new URL(urls.siteUrl).pathname || "/",
  },
});

// 3. Upload dist/. The hosting CLI resolves `convex` from its cwd, so give it the shim.
console.log(`\n▸ Uploading dist/ to ${urls.siteUrl}`);
const scratch = mkdtempSync(join(tmpdir(), "preview-upload-"));
try {
  const shimDir = join(scratch, "node_modules", "convex");
  mkdirSync(join(shimDir, "bin"), { recursive: true });
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ private: true }));
  writeFileSync(join(shimDir, "package.json"), JSON.stringify({ name: "convex", version: "0.0.0" }));
  writeFileSync(
    join(shimDir, "bin", "main.js"),
    `const { spawnSync } = require("node:child_process");
const argv = process.argv.slice(2).filter((a) => a !== "--prod");
const res = spawnSync(process.execPath, [${JSON.stringify(convexBin)}, ...argv, "--preview-name", ${JSON.stringify(name)}],
  { stdio: "inherit", cwd: ${JSON.stringify(root)} });
process.exit(res.status ?? 1);
`,
  );
  run(process.execPath, [hostingBin, "upload", "--dist", join(root, "dist")], { cwd: scratch });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`\nPreview is live at ${urls.siteUrl}`);
