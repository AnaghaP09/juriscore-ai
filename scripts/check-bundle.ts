import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// G-h / PLAN-5: the browser bundle must not contain the provider SDK, the API host, a
// credential variable name, a server gateway module, or any fixture secret.
// Run after `bun run build`. Scans every file the build serves to browsers.

const root = resolve(import.meta.dir, "..");
const candidates = [".output/public", "dist/client"].map((dir) => join(root, dir));

// The SDK by package name, its endpoint, both credential variable names, the server-only
// gateway modules (their paths appear in source maps if they were ever bundled), and the
// synthetic key and token the gateway check uses.
export const FORBIDDEN = [
  "@anthropic-ai/sdk",
  "api.anthropic.com",
  "ANTHROPIC_API_KEY",
  "JURISCORE_LLM_API_KEY",
  "gateway/server.ts",
  "gateway/access.ts",
  "gateway/adapter/anthropic",
  "JURISCORECANARYKEYVALUE",
  "gateway-token-canary",
];

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

/** Returns the number of files scanned; throws on the first forbidden string. */
export function scanClientOutput(dirs: string[]) {
  let scanned = 0;
  for (const dir of dirs) {
    for (const path of files(dir)) {
      if (!/\.(m?js|css|html|json|map)$/.test(path)) continue;
      const text = readFileSync(path, "utf8");
      scanned += 1;
      for (const needle of FORBIDDEN) {
        assert.equal(text.includes(needle), false, `${needle} found in client output: ${path}`);
      }
    }
  }
  return scanned;
}

// Negative self-test: a fake bundle that contains the SDK name must fail the scan.
{
  const dir = mkdtempSync(join(tmpdir(), "juriscore-bundle-"));
  try {
    writeFileSync(join(dir, "app.js"), 'import("@anthropic-ai/sdk")');
    assert.throws(() => scanClientOutput([dir]), /found in client output/);
    writeFileSync(join(dir, "app.js"), "console.log('clean')");
    assert.equal(scanClientOutput([dir]), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const clientDirs = candidates.filter((dir) => existsSync(dir));
assert.ok(clientDirs.length > 0, "No client build output found. Run `bun run build` first.");
const scanned = scanClientOutput(clientDirs);
assert.ok(scanned > 0, "The client build output contained no scannable files.");

console.log(`JurisCore bundle check passed (${scanned} client files scanned).`);
