#!/usr/bin/env bun
/**
 * Builds the JurisCore on-prem release package (SPEC_DISTRIBUTION.md).
 *
 *   bun scripts/package-release.mjs [version]
 *
 * Output: dist/juriscore-<version>/  (the staged package, also the Docker build
 * context) and dist/juriscore-<version>.zip.
 *
 * The deterministic checks are the release gate: this script runs
 * `bun run check:core` and `bun run build` itself and refuses to package if
 * either fails, so packaging cannot outrun the checks.
 *
 * Implementation choices the spec left open, recorded here:
 *
 * 1. Nitro preset `bun`, not the repository default `cloudflare-module`. The
 *    package has to start on a buyer's own machine with one command; the
 *    Cloudflare output needs wrangler. The bun preset traces every runtime
 *    dependency into `.output/server/node_modules` during the build, so the
 *    package installs nothing at runtime and needs no registry access — the
 *    air-gap requirement is met by construction rather than by a lockfile.
 * 2. The version comes from the argument, then `RELEASE_VERSION`, then the git
 *    tag. package.json is private and carries no version field, and the spec
 *    adopts a plain v0.x tag series, so the tag is the single source.
 * 3. `bun build --compile` (a single binary) was investigated and not used: the
 *    spec marks it optional for this slice, and the traced output already runs
 *    from one command with no install step.
 * 4. The zip is produced by whichever archiver the machine already has — `zip`
 *    on Linux and macOS, the bundled bsdtar on Windows. No archiving dependency
 *    is added to the project.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const log = (message) => process.stdout.write(`[package] ${message}\n`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: IS_WIN,
    ...options,
  });
  if (result.status !== 0) {
    log(`FAILED: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", shell: IS_WIN });
  return result.status === 0 ? (result.stdout || "").trim() : "";
}

function resolveVersion() {
  const explicit = process.argv[2] || process.env.RELEASE_VERSION;
  if (explicit) return explicit.replace(/^v/, "");
  const described = capture("git", ["describe", "--tags", "--abbrev=0"]);
  if (described) return described.replace(/^v/, "");
  return "0.0.0-dev";
}

const VERSION = resolveVersion();
const NAME = `juriscore-${VERSION}`;
const DIST = join(ROOT, "dist");
const STAGE = join(DIST, NAME);
const ARCHIVE = join(DIST, `${NAME}.zip`);

// --- Release gate -----------------------------------------------------------
log(`Packaging ${NAME}`);
log("Gate 1/2: bun run check:core");
run("bun", ["run", "check:core"]);
log("Gate 2/2: bun run build");
run("bun", ["run", "build"], { env: { ...process.env, NITRO_PRESET: "bun" } });

const OUTPUT = join(ROOT, ".output");
if (!existsSync(join(OUTPUT, "server", "index.mjs"))) {
  log("The build produced no server entry at .output/server/index.mjs.");
  process.exit(1);
}

// --- Stage ------------------------------------------------------------------
rmSync(STAGE, { recursive: true, force: true });
rmSync(ARCHIVE, { force: true });
mkdirSync(STAGE, { recursive: true });

cpSync(OUTPUT, STAGE, { recursive: true });
for (const file of ["RUN.md", "start.sh", "start.cmd"]) {
  cpSync(join(ROOT, "packaging", file), join(STAGE, file));
}
cpSync(join(ROOT, "packaging", "Dockerfile"), join(STAGE, "Dockerfile"));
writeFileSync(join(STAGE, "VERSION"), `${VERSION}\n`);
try {
  chmodSync(join(STAGE, "start.sh"), 0o755);
} catch {
  // Windows has no executable bit; the workflow runs on Linux and sets it there.
}

// --- Archive ----------------------------------------------------------------
function archive() {
  const zip = spawnSync("zip", ["-qr", ARCHIVE, NAME], { cwd: DIST, stdio: "inherit" });
  if (zip.status === 0) return "zip";

  // Windows ships bsdtar as tar.exe, which writes zip archives.
  const tar = IS_WIN
    ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";
  const fallback = spawnSync(tar, ["-a", "-c", "-f", ARCHIVE, NAME], {
    cwd: DIST,
    stdio: "inherit",
  });
  if (fallback.status === 0) return "bsdtar";

  log("No archiver was available. Install `zip`, or archive dist/ manually.");
  process.exit(1);
}

const archiver = archive();
log(`Staged package: dist/${NAME}/`);
log(`Archive (${archiver}): dist/${NAME}.zip`);
log("Container image: docker build -t juriscore:" + VERSION + ` dist/${NAME}`);
