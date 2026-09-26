import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// G-h: the browser bundle must not contain the provider SDK or any credential name.
// Run after `bun run build`. Scans every file the build serves to browsers.

const root = resolve(import.meta.dir, "..");
const candidates = [".output/public", "dist/client"].map((dir) => join(root, dir));
const clientDirs = candidates.filter((dir) => existsSync(dir));
assert.ok(clientDirs.length > 0, "No client build output found. Run `bun run build` first.");

// The SDK by package name, its default endpoint, and the provider credential's name.
const FORBIDDEN = ["@anthropic-ai/sdk", "api.anthropic.com", "ANTHROPIC_API_KEY"];

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let scanned = 0;
for (const dir of clientDirs) {
  for (const path of files(dir)) {
    if (!/\.(m?js|css|html|json|map)$/.test(path)) continue;
    const text = readFileSync(path, "utf8");
    scanned += 1;
    for (const needle of FORBIDDEN) {
      assert.equal(text.includes(needle), false, `${needle} found in client output: ${path}`);
    }
  }
}
assert.ok(scanned > 0, "The client build output contained no scannable files.");

console.log(`JurisCore bundle check passed (${scanned} client files scanned).`);
