#!/usr/bin/env bun
/**
 * Cross-platform, self-healing dependency install for JurisCore.
 *
 * Works on macOS and Windows. Runs `bun install`, and on Windows it
 * automatically recovers from antivirus (Windows Defender) file-locks that can
 * make `bun install` fail with `EPERM ... NtSetInformationFile` while moving a
 * freshly extracted package into Bun's cache.
 *
 * Runnable with either runtime:
 *   bun scripts/setup.mjs      (recommended — no Node.js required)
 *   node scripts/setup.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NODE_MODULES = join(ROOT, "node_modules");
const IS_WIN = process.platform === "win32";
const MAX_ATTEMPTS = 5;

// Prefer Windows' built-in bsdtar (handles Windows paths natively); fall back to
// whatever `tar` is on PATH (macOS ships bsdtar too).
const TAR = (() => {
  if (IS_WIN) {
    const sys = join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "tar.exe",
    );
    if (existsSync(sys)) return sys;
  }
  return "tar";
})();

const log = (msg) => process.stdout.write(`[setup] ${msg}\n`);

// Run a command, inheriting stdio. `shell` on Windows so `bun`/`tar` resolve
// against PATHEXT (bun.exe, tar.exe).
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: IS_WIN,
    ...opts,
  });
}

// 1. Bun must be installed (it is the project's toolchain).
if (run("bun", ["--version"], { stdio: "ignore" }).status !== 0) {
  log("Bun is required but was not found on your PATH. Install it first:");
  log(
    IS_WIN
      ? '  Windows : powershell -c "irm bun.sh/install.ps1 | iex"'
      : "  macOS   : curl -fsSL https://bun.sh/install | bash",
  );
  log("Then re-run:  bun run setup");
  process.exit(1);
}

// 2. Run `bun install`, retrying a few times. On Windows each retry makes
//    progress because previously extracted packages are already cached, so the
//    antivirus scan window shrinks with every pass.
let lastOutput = "";
let installedCleanly = false;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  log(`bun install (attempt ${attempt}/${MAX_ATTEMPTS})...`);
  const result = run("bun", ["install"], { stdio: "pipe" });
  lastOutput = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(lastOutput);
  if (result.status === 0) {
    installedCleanly = true;
    break;
  }
}

// 3. Figure out which packages still need to be recovered.
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const directDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

const missing = new Set();
// (a) packages Bun explicitly reported as failed this run
for (const m of lastOutput.matchAll(/extracting tarball from (\S+)/g)) {
  missing.add(m[1]);
}
for (const m of lastOutput.matchAll(/moving "([^"]+)" to cache/g)) {
  missing.add(m[1]);
}
// (b) any direct dependency that is not actually present on disk
for (const name of directDeps) {
  if (!existsSync(join(NODE_MODULES, name, "package.json"))) missing.add(name);
}
// Drop anything that is in fact present (Bun may have recovered it on a retry).
for (const name of [...missing]) {
  if (existsSync(join(NODE_MODULES, name, "package.json"))) missing.delete(name);
}

if (missing.size === 0) {
  log(
    installedCleanly
      ? "All dependencies installed. ✔"
      : "All required dependencies are present. ✔",
  );
  log("Start the app with:  bun run dev");
  process.exit(0);
}

// 4. Self-heal: extract each blocked package straight from the npm registry
//    into node_modules. Plain file writes avoid the cache-rename step that the
//    antivirus was locking.
log(
  `${missing.size} package(s) were blocked by antivirus. Recovering: ${[...missing].join(", ")}`,
);

const lock = readFileSync(join(ROOT, "bun.lock"), "utf8");
function lockedVersion(name) {
  // bun.lock packages section: "name": ["name@version", ...
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = lock.match(new RegExp(`"${esc}":\\s*\\["${esc}@([^"]+)"`));
  return match ? match[1] : null;
}

let recovered = 0;
for (const name of missing) {
  const version = lockedVersion(name);
  if (!version) {
    log(`  ! ${name}: no pinned version in bun.lock — skipping`);
    continue;
  }
  const basename = name.includes("/") ? name.split("/").pop() : name;
  const url = `https://registry.npmjs.org/${name}/-/${basename}-${version}.tgz`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const archive = Buffer.from(await res.arrayBuffer());
    const dest = join(NODE_MODULES, name);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    // Feed the archive on stdin and extract into `dest` (cwd). Passing no path
    // arguments avoids GNU tar mistaking a Windows "C:\..." path for a remote
    // host, and works the same with bsdtar on macOS and Windows.
    const extract = spawnSync(
      TAR,
      ["-xz", "--strip-components=1", "-f", "-"],
      { cwd: dest, input: archive, encoding: "buffer" },
    );
    if (extract.status !== 0) {
      throw new Error(
        (extract.stderr && extract.stderr.toString().trim()) ||
          "tar extraction failed",
      );
    }
    log(`  ✔ ${name}@${version}`);
    recovered += 1;
  } catch (err) {
    log(`  ✗ ${name}: ${err.message}`);
  }
}

if (recovered === missing.size) {
  log("Self-heal complete. All dependencies are present. ✔");
  log("Start the app with:  bun run dev");
  process.exit(0);
}

log(
  "Some packages could not be recovered automatically. Re-run `bun run setup`, " +
    "or add a Windows Defender exclusion for your Bun cache (see README troubleshooting).",
);
process.exit(1);
