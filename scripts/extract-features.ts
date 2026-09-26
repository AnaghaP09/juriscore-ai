/**
 * Turns mined commit history into drift-risk training rows (Phase B).
 *
 * Train/serve parity: every row is produced by the same parser (`parseUnifiedDiff`), the
 * same documentation rule (`isDocPath`) and the same extractor (`extractDriftFeatures`)
 * the workbench uses at inference time. Python only fits coefficients to these rows.
 *
 * Input: a `git log -p` stream whose commits start with a line `@@COMMIT@@ <sha>`.
 * Output: one JSON object per line: { repo, sha, label, vector } where `vector` follows
 * FEATURE_NAMES order and `label` is 1 when the commit also touched documentation.
 * Commits with no code files (documentation-only) are skipped: the predictor never scores
 * them, so they are not training examples either.
 *
 * Usage: bun scripts/extract-features.ts <repo-name> <log-file> > rows.jsonl
 */
import { readFileSync } from "node:fs";
import { parseUnifiedDiff } from "../src/lib/juriscore/plumb/sources";
import { isDocPath } from "../src/lib/juriscore/predict/doc-paths";
import { extractDriftFeatures, FEATURE_NAMES } from "../src/lib/juriscore/predict/features";

const MARKER = "@@COMMIT@@ ";
// A commit this large is usually a vendored dependency, a generated file or a mass
// reformat; it says little about whether a single change needed a docs update.
const MAX_PATCH_LINES = 20_000;

const [repo, logFile] = process.argv.slice(2);
if (!repo || !logFile) {
  console.error("usage: bun scripts/extract-features.ts <repo-name> <log-file>");
  process.exit(2);
}

const text = readFileSync(logFile, "utf8");
const commits = text.split(`\n${MARKER}`);
let written = 0;
let skippedDocsOnly = 0;
let skippedLarge = 0;
const out: string[] = [];

for (const [index, chunk] of commits.entries()) {
  const block = index === 0 ? chunk.replace(new RegExp(`^${MARKER}`), "") : chunk;
  const newline = block.indexOf("\n");
  if (newline < 0) continue;
  const sha = block.slice(0, newline).trim();
  const patch = block.slice(newline + 1);
  if (!/^[0-9a-f]{40}$/.test(sha)) continue;
  if (patch.split("\n").length > MAX_PATCH_LINES) {
    skippedLarge += 1;
    continue;
  }

  const files = parseUnifiedDiff(patch, { includeMetadataOnly: true });
  if (files.length === 0) continue;
  const label = files.some((file) => isDocPath(file.path)) ? 1 : 0;
  const extraction = extractDriftFeatures({ sourceKind: "diff", files });
  if (extraction.status !== "ok") {
    skippedDocsOnly += 1;
    continue;
  }
  out.push(
    JSON.stringify({
      repo,
      sha,
      label,
      vector: FEATURE_NAMES.map((name) => extraction.vector[name]),
    }),
  );
  written += 1;
}

process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
console.error(
  `${repo}: rows=${written} docs-only skipped=${skippedDocsOnly} oversized skipped=${skippedLarge}`,
);
