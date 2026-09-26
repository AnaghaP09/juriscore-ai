import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  DRIFT_FEATURES_VERSION,
  driftRiskPredictionSchema,
  type DriftRiskPrediction,
} from "../src/lib/juriscore/core/contracts";
import { compareClaims } from "../src/lib/juriscore/plumb/engine";
import {
  BUILT_IN_SUBJECTS,
  claimsFromDiff,
  claimsFromDocument,
  documentSentences,
  parseSourceSnapshot,
  parseUnifiedDiff,
  type DiffFile,
} from "../src/lib/juriscore/plumb/sources";
import { DOC_PATHS_VERSION, isDocPath } from "../src/lib/juriscore/predict/doc-paths";
import {
  capabilityState,
  DEFAULT_TIER,
  resolveTier,
} from "../src/lib/juriscore/predict/entitlements";
import {
  buildPredictionEnvelope,
  buildPredictionRequest,
  canonicalJson,
  diffDigest,
  isCurrentPredictionResult,
  pickEnvelope,
  requestDigest,
  serializePredictionEnvelope,
  type ActivePredictionRequest,
  type PredictionEnvelope,
} from "../src/lib/juriscore/predict/envelope";
import {
  classifyPath,
  extractDriftFeatures,
  FEATURE_NAMES,
  type FeatureExtraction,
  type PredictionInput,
} from "../src/lib/juriscore/predict/features";
import {
  assessWorkbenchRisk,
  buildWorkbenchRequest,
  docsTouchedBy,
  parseConnectedChange,
  riskScorePercent,
  topContributions,
  type ConnectedChange,
} from "../src/lib/juriscore/predict/workbench";
import { SIMULATED_SEED, summarizeTrailingWeek } from "../src/lib/juriscore/demo-store";
import {
  addPlumbCheck,
  latestRiskAfter,
  normalizeLedger,
  type LocalMetricsLedger,
} from "../src/lib/juriscore/metrics-ledger";
import {
  bandFor,
  LOCAL_WEIGHTS,
  loadLocalWeights,
  predictDriftRisk,
  scoreFeatureVector,
  WeightsError,
} from "../src/lib/juriscore/predict/model";

const source = (relative: string) =>
  readFileSync(new URL(`../src/lib/juriscore/${relative}`, import.meta.url), "utf8");

function features(input: PredictionInput): FeatureExtraction {
  const extraction = extractDriftFeatures(input);
  assert.equal(extraction.status, "ok", "expected features for a code change");
  return extraction as FeatureExtraction;
}

function scored(input: PredictionInput): DriftRiskPrediction {
  const prediction = predictDriftRisk(input);
  assert.ok(!("status" in prediction), "expected a score for a code change");
  return prediction as DriftRiskPrediction;
}

const diff = (text: string): PredictionInput => ({
  sourceKind: "diff",
  files: parseUnifiedDiff(text),
});

const harmless = `diff --git a/src/util/format.ts b/src/util/format.ts
--- a/src/util/format.ts
+++ b/src/util/format.ts
@@ -1,3 +1,3 @@
 import { pad } from "./pad";
-// tidy
+// tidy up
 export { pad };`;

const publicLimit = `diff --git a/src/config/limits.ts b/src/config/limits.ts
--- a/src/config/limits.ts
+++ b/src/config/limits.ts
@@ -1,3 +1,3 @@
 // Upload limits
-export const MAX_UPLOAD_LIMIT_MB = 25;
+export const MAX_UPLOAD_LIMIT_MB = 50;
 export const unrelated = true;`;

const docEdit = `diff --git a/docs/limits.md b/docs/limits.md
--- a/docs/limits.md
+++ b/docs/limits.md
@@ -1,2 +1,2 @@
 # Limits
-Uploads are capped at 25 MB, export const MAX_UPLOAD_LIMIT_MB = 25;
+Uploads are capped at 50 MB, export const MAX_UPLOAD_LIMIT_MB = 50;`;

// ---------------------------------------------------------------------------
// Doc-path rule
// ---------------------------------------------------------------------------

assert.equal(DOC_PATHS_VERSION, "doc-paths.v1");
for (const path of [
  "README.md",
  "readme",
  "CHANGELOG",
  "packages/api/CHANGELOG.txt",
  "docs/guide.txt",
  "site/docs/intro.html",
  "notes.mdx",
  "manual.rst",
  "docs\\windows.txt",
]) {
  assert.equal(isDocPath(path), true, `${path} is documentation`);
}
for (const path of ["src/docs.ts", "src/payments.ts", "config.yaml", "pasted fragment", ""]) {
  assert.equal(isDocPath(path), false, `${path} is not documentation`);
}

assert.equal(classifyPath("src/__tests__/limits.ts"), "test");
assert.equal(classifyPath("src/limits.test.ts"), "test");
assert.equal(classifyPath("db/migrations/001_init.sql"), "schema");
assert.equal(classifyPath("src/routes/api/predict.ts"), "api");
assert.equal(classifyPath("config/app.yaml"), "config");
assert.equal(classifyPath("src/payments.ts"), "source");

// ---------------------------------------------------------------------------
// Acceptance 1: extraction is pure, change-level, and never sees the label
// ---------------------------------------------------------------------------

// Pure: no clock, no randomness, no network anywhere in the free-tier path.
for (const file of ["predict/doc-paths.ts", "predict/features.ts", "predict/model.ts"]) {
  const text = source(file);
  for (const forbidden of ["Date.now", "new Date", "Math.random", "fetch(", "XMLHttpRequest"]) {
    assert.equal(text.includes(forbidden), false, `${file} must not use ${forbidden}`);
  }
}

const combined = diff(`${harmless}\n${publicLimit}`);
assert.equal(combined.files.length, 2);
assert.deepEqual(features(combined), features(diff(`${harmless}\n${publicLimit}`)));

// (a) Order-invariant: the risky file need not be first.
const reversed: PredictionInput = { sourceKind: "diff", files: [...combined.files].reverse() };
assert.deepEqual(features(reversed), features(combined));
assert.deepEqual(scored(reversed), scored(combined));

// (b) A harmless first file does not hide a public limit change in the second.
const harmlessOnly = scored(diff(harmless));
const withLimit = scored(combined);
assert.ok(
  withLimit.score > harmlessOnly.score,
  `limit change should raise the score (${withLimit.score} <= ${harmlessOnly.score})`,
);
assert.ok(features(combined).vector.identifier_signal_hits > 0);
assert.ok(features(combined).vector.constant_default_changes > 0);
assert.ok(features(combined).vector.public_symbol_changes > 0);

// (c) Context lines never contribute.
const withNoisyContext = `diff --git a/src/config/limits.ts b/src/config/limits.ts
--- a/src/config/limits.ts
+++ b/src/config/limits.ts
@@ -1,6 +1,6 @@
 export const kycThreshold = 10_000;
 export const MAX_RETENTION_DAYS = "90";
 // Upload limits
-export const MAX_UPLOAD_LIMIT_MB = 25;
+export const MAX_UPLOAD_LIMIT_MB = 50;
 export const unrelated = true;`;
assert.deepEqual(features(diff(withNoisyContext)).vector, features(diff(publicLimit)).vector);

// (d) Documentation files never contribute, and are reported as already touched.
const withDoc = features(diff(`${publicLimit}\n${docEdit}`));
assert.deepEqual(withDoc.vector, features(diff(publicLimit)).vector);
assert.deepEqual(withDoc.docsTouched, ["docs/limits.md"]);
assert.deepEqual(withDoc.codePaths, ["src/config/limits.ts"]);
assert.deepEqual(scored(diff(`${publicLimit}\n${docEdit}`)), scored(diff(publicLimit)));

// (e) A pasted whole file has no baseline: no features and no score.
const snapshotInput: PredictionInput = {
  sourceKind: "snapshot",
  files: [parseSourceSnapshot("export const kycThreshold = 25_000;", "src/payments.ts")],
};
assert.deepEqual(extractDriftFeatures(snapshotInput), {
  status: "unavailable",
  reason: "no-baseline",
});
assert.deepEqual(predictDriftRisk(snapshotInput), {
  status: "unavailable",
  reason: "no-baseline",
});
// The source kind is what the caller loaded, not a guess from line kinds.
assert.equal(
  extractDriftFeatures({ sourceKind: "snapshot", files: combined.files }).status,
  "unavailable",
);

// A change with only documentation left has nothing to score.
assert.deepEqual(predictDriftRisk(diff(docEdit)), {
  status: "unavailable",
  reason: "no-code-files",
});

// ---------------------------------------------------------------------------
// Acceptance 2: the prediction contract
// ---------------------------------------------------------------------------

const valid = scored(combined);
assert.equal(valid.tier, "free");
assert.equal(valid.engine, "local-logistic");
assert.equal(valid.featuresVersion, DRIFT_FEATURES_VERSION);
assert.equal(valid.maturity, "target");
assert.equal(valid.deterministic, true);
assert.match(valid.modelVersion, /placeholder/, "placeholder weights are labelled as such");
assert.equal(LOCAL_WEIGHTS.placeholder, true);
assert.ok(driftRiskPredictionSchema.safeParse(valid).success);

const rejects = (override: Record<string, unknown>, why: string) =>
  assert.equal(driftRiskPredictionSchema.safeParse({ ...valid, ...override }).success, false, why);
rejects({ score: 1.01 }, "score above 1");
rejects({ score: -0.01 }, "score below 0");
rejects({ score: Number.NaN }, "score not a number");
rejects({ contributions: [] }, "empty contributions");
rejects({ featuresVersion: "drift-features.v0" }, "features version mismatch");
rejects({ band: "block" }, "a band is not a verdict");
rejects({ deterministic: false }, "the local engine is deterministic");
rejects({ engine: "provider-model" }, "a model-backed prediction is not deterministic");
assert.equal(
  driftRiskPredictionSchema.safeParse({
    ...valid,
    tier: "paid",
    engine: "provider-model",
    deterministic: false,
  }).success,
  true,
);

// Weights fitted to another feature version are refused, not tolerated.
assert.throws(
  () => loadLocalWeights({ ...LOCAL_WEIGHTS, featuresVersion: "drift-features.v0" }),
  WeightsError,
);
const { comment_only_ratio: _dropped, ...partial } = LOCAL_WEIGHTS.coefficients;
assert.throws(() => loadLocalWeights({ ...LOCAL_WEIGHTS, coefficients: partial }), WeightsError);
assert.throws(() => loadLocalWeights({ ...LOCAL_WEIGHTS, intercept: "high" }), WeightsError);

// The scoring entry points refuse mismatched weights themselves; nothing depends on the
// caller having gone through loadLocalWeights first.
const mismatchedWeights = [
  { ...LOCAL_WEIGHTS, featuresVersion: "drift-features.v0" },
  { ...LOCAL_WEIGHTS, coefficients: partial },
  { ...LOCAL_WEIGHTS, coefficients: { ...LOCAL_WEIGHTS.coefficients, unknown_feature: 1 } },
];
const combinedVector = features(combined).vector;
for (const weights of mismatchedWeights) {
  assert.throws(() => predictDriftRisk(combined, weights), WeightsError);
  assert.throws(() => scoreFeatureVector(combinedVector, weights), WeightsError);
  // Refused before extraction, even for a change with nothing to score.
  assert.throws(() => predictDriftRisk(snapshotInput, weights), WeightsError);
}
// A validated pack is frozen, so it cannot be altered after the check.
assert.equal(Object.isFrozen(LOCAL_WEIGHTS), true);
assert.equal(Object.isFrozen(LOCAL_WEIGHTS.coefficients), true);
assert.deepEqual(scoreFeatureVector(combinedVector), scored(combined));

// ---------------------------------------------------------------------------
// Acceptance 3: deterministic, ranked attribution
// ---------------------------------------------------------------------------

assert.deepEqual(scored(combined), scored(combined));
assert.equal(JSON.stringify(scored(combined)), JSON.stringify(scored(reversed)));
assert.equal(valid.contributions.length, FEATURE_NAMES.length);
for (let index = 1; index < valid.contributions.length; index += 1) {
  assert.ok(
    Math.abs(valid.contributions[index - 1].contribution) >=
      Math.abs(valid.contributions[index].contribution),
    "contributions are ranked by magnitude",
  );
}
for (const contribution of valid.contributions) {
  assert.equal(
    contribution.weight,
    LOCAL_WEIGHTS.coefficients[contribution.feature],
    "attribution reports the shipped weight",
  );
}

// ---------------------------------------------------------------------------
// Acceptance 10: verdict independence
// ---------------------------------------------------------------------------

function claimsFor(files: DiffFile[]) {
  return files.flatMap((file) => claimsFromDiff(file, BUILT_IN_SUBJECTS, "pr-1"));
}

const codeClaims = claimsFor(combined.files);
const docClaims = claimsFromDocument(
  documentSentences("Enhanced due diligence applies above $10,000."),
  BUILT_IN_SUBJECTS,
  { sourceId: "kyc.md", sourceVersion: "v1" },
);
const kycPatch = parseUnifiedDiff(`diff --git a/src/payments.ts b/src/payments.ts
--- a/src/payments.ts
+++ b/src/payments.ts
@@ -1,1 +1,1 @@
-  kycThreshold: 10_000,
+  kycThreshold: 25_000,`);
const authorities = [...codeClaims, ...claimsFor(kycPatch)];
const withoutPredictor = compareClaims(authorities, docClaims, { policyIds: ["pii-baseline"] });
const prediction = scored({ sourceKind: "diff", files: [...combined.files, ...kycPatch] });
const withPredictor = compareClaims(authorities, docClaims, { policyIds: ["pii-baseline"] });
assert.deepEqual(withPredictor, withoutPredictor);
assert.equal(withoutPredictor.verdict, "block");
assert.equal("verdict" in prediction, false);
// A verdict smuggled onto a prediction is not part of the contract and does not survive it.
const smuggledVerdict = driftRiskPredictionSchema.parse({ ...prediction, verdict: "allow" });
assert.equal("verdict" in smuggledVerdict, false);

// No predictor module can reach the comparator, and the comparator never learns the
// predictor exists.
const predictDirectory = new URL("../src/lib/juriscore/predict/", import.meta.url);
for (const file of readdirSync(predictDirectory).filter((name) => /\.tsx?$/.test(name))) {
  const text = source(`predict/${file}`);
  assert.equal(/plumb\/engine/.test(text), false, `${file} must not import the comparator`);
  assert.equal(/\bverdict\b/.test(text), false, `${file} must not mention a verdict`);
}
assert.equal(/predict\//.test(source("plumb/engine.ts")), false);

// ---------------------------------------------------------------------------
// Acceptance 11 / 11a: the envelope and its digest
// ---------------------------------------------------------------------------

const DOC_SECRET = "Document sentence that must never be exported";
const CODE_SECRET = "codeLineThatMustNeverBeExported";
const secretChange = parseUnifiedDiff(`diff --git a/src/secret.ts b/src/secret.ts
--- a/src/secret.ts
+++ b/src/secret.ts
@@ -1,1 +1,1 @@
-const ${CODE_SECRET} = 1;
+const ${CODE_SECRET} = 2;`);

const policyConfig = { policies: [{ id: "pii-baseline", version: "1" }] };
const secretRequest = await buildPredictionRequest({
  sourceKind: "diff",
  files: secretChange,
  documents: [{ id: "handbook.pdf", content: DOC_SECRET }],
  policyConfig,
});
const secretPrediction = scored({ sourceKind: "diff", files: secretChange });
// Anything a model tier might attach must be dropped by the allowlist.
const decorated = {
  ...secretPrediction,
  rationale: "RATIONALE_TEXT",
  excerpt: "EXCERPT_TEXT",
  candidates: [{ subject: "CANDIDATE_TEXT" }],
} as DriftRiskPrediction;
const envelope = await buildPredictionEnvelope(secretRequest, decorated);
const smuggled = {
  ...envelope,
  display: { rationale: "RATIONALE_TEXT" },
  request: { ...envelope.request, rawDiff: CODE_SECRET, documentText: DOC_SECRET },
} as unknown as PredictionEnvelope;

for (const exported of [
  serializePredictionEnvelope(envelope),
  serializePredictionEnvelope(smuggled),
  canonicalJson(pickEnvelope(smuggled)),
  JSON.stringify(envelope),
]) {
  for (const forbidden of [
    DOC_SECRET,
    CODE_SECRET,
    "RATIONALE_TEXT",
    "EXCERPT_TEXT",
    "CANDIDATE_TEXT",
    "display",
    "rawDiff",
  ]) {
    assert.equal(exported.includes(forbidden), false, `envelope must not carry ${forbidden}`);
  }
}
assert.deepEqual(Object.keys(envelope).sort(), [
  "envelopeVersion",
  "prediction",
  "request",
  "requestDigest",
]);
assert.deepEqual(Object.keys(envelope.request).sort(), [
  "diffDigest",
  "documents",
  "featuresVersion",
  "model",
  "policyConfigDigest",
  "sourceKind",
  "weightsDigest",
]);
assert.equal(envelope.request.documents[0].id, "handbook.pdf");
assert.match(envelope.request.documents[0].contentDigest, /^[0-9a-f]{64}$/);
assert.equal(envelope.request.model, null);

// Canonical JSON: sorted keys, no whitespace.
assert.equal(canonicalJson({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
assert.throws(() => canonicalJson({ a: Number.POSITIVE_INFINITY }));

const unknownA = parseUnifiedDiff(`diff --git a/src/upload.ts b/src/upload.ts
--- a/src/upload.ts
+++ b/src/upload.ts
@@ -1,1 +1,1 @@
-  maxUploadMb: 25,
+  maxUploadMb: 50,`);
const unknownB = parseUnifiedDiff(`diff --git a/src/session.ts b/src/session.ts
--- a/src/session.ts
+++ b/src/session.ts
@@ -1,1 +1,1 @@
-  sessionTimeoutMinutes: 15,
+  sessionTimeoutMinutes: 30,`);
// Neither change yields a Plumb claim, which is why the claim-based receipt digest
// cannot tell them apart.
assert.equal(claimsFromDiff(unknownA[0], BUILT_IN_SUBJECTS, "v").length, 0);
assert.equal(claimsFromDiff(unknownB[0], BUILT_IN_SUBJECTS, "v").length, 0);

async function envelopeFor(files: DiffFile[]) {
  const request = await buildPredictionRequest({
    sourceKind: "diff",
    files,
    documents: [{ id: "handbook.pdf", content: "Same document." }],
    policyConfig,
  });
  return buildPredictionEnvelope(request, predictDriftRisk({ sourceKind: "diff", files }));
}

const envelopeA = await envelopeFor(unknownA);
const envelopeB = await envelopeFor(unknownB);
assert.notEqual(envelopeA.requestDigest, envelopeB.requestDigest);

const both = [...unknownA, ...unknownB];
const envelopeAB = await envelopeFor(both);
const envelopeBA = await envelopeFor([...both].reverse());
assert.equal(envelopeAB.requestDigest, envelopeBA.requestDigest);
assert.equal(serializePredictionEnvelope(envelopeAB), serializePredictionEnvelope(envelopeBA));

// Documents, policy configuration, and source kind are all bound into the digest.
const otherDocument = await buildPredictionRequest({
  sourceKind: "diff",
  files: unknownA,
  documents: [{ id: "handbook.pdf", content: "A different document." }],
  policyConfig,
});
assert.notEqual(await requestDigest(otherDocument), envelopeA.requestDigest);
const otherPolicy = await buildPredictionRequest({
  sourceKind: "diff",
  files: unknownA,
  documents: [{ id: "handbook.pdf", content: "Same document." }],
  policyConfig: { policies: [] },
});
assert.notEqual(await requestDigest(otherPolicy), envelopeA.requestDigest);
const asSnapshot = { ...envelopeA.request, sourceKind: "snapshot" as const };
assert.notEqual(await requestDigest(asSnapshot), envelopeA.requestDigest);

// Stale results are discarded: a different request, an older generation, no active
// request at all, or an envelope whose digest no longer matches what it carries.
const active = { generation: 3, requestDigest: envelopeA.requestDigest };
const isCurrent = (generation: number, candidate: PredictionEnvelope) =>
  isCurrentPredictionResult(() => active, { generation, envelope: candidate });
assert.equal(await isCurrent(3, envelopeA), true);
assert.equal(await isCurrent(3, envelopeB), false);
assert.equal(await isCurrent(2, envelopeA), false);
const resultA = { generation: 3, envelope: envelopeA };
const noActive = () => null;
assert.equal(await isCurrentPredictionResult(noActive, resultA), false);
const tampered = {
  ...envelopeA,
  request: { ...envelopeA.request, diffDigest: envelopeB.request.diffDigest },
};
assert.equal(await isCurrent(3, tampered), false);

// The inputs can change while the digest is being verified. Freshness is judged against
// the active request as it stands once verification finishes, not as it was when the
// check began.
let latest: ActivePredictionRequest | null = null;
async function whileVerifying(change: () => void) {
  latest = { generation: 3, requestDigest: envelopeA.requestDigest };
  const pending = isCurrentPredictionResult(() => latest, resultA);
  change();
  return pending;
}
const unchanged = () => undefined;
const generationBumped = () => {
  latest = { generation: 4, requestDigest: envelopeA.requestDigest };
};
const requestReplaced = () => {
  latest = { generation: 4, requestDigest: envelopeB.requestDigest };
};
const activeCleared = () => {
  latest = null;
};
assert.equal(await whileVerifying(unchanged), true);
assert.equal(await whileVerifying(generationBumped), false);
assert.equal(await whileVerifying(requestReplaced), false);
assert.equal(await whileVerifying(activeCleared), false);

// ---------------------------------------------------------------------------
// Acceptance 11d: canonical paths for deletions
// ---------------------------------------------------------------------------

const deleteDoc = `diff --git a/docs/guide.md b/docs/guide.md
deleted file mode 100644
index 3b18e51..0000000
--- a/docs/guide.md
+++ /dev/null
@@ -1,2 +0,0 @@
-# Guide
-Uploads are capped at 25 MB.`;
const [deletedDoc] = parseUnifiedDiff(deleteDoc);
assert.equal(deletedDoc.path, "docs/guide.md");
assert.equal(deletedDoc.change, "deleted");
assert.deepEqual(predictDriftRisk(diff(deleteDoc)), {
  status: "unavailable",
  reason: "no-code-files",
});

const deleteDocWithCode = features(diff(`${deleteDoc}\n${publicLimit}`));
assert.deepEqual(deleteDocWithCode.docsTouched, ["docs/guide.md"]);
assert.deepEqual(deleteDocWithCode.vector, features(diff(publicLimit)).vector);

const deleteCode = `diff --git a/src/legacy/limits.ts b/src/legacy/limits.ts
deleted file mode 100644
index 3b18e51..0000000
--- a/src/legacy/limits.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const MAX_UPLOAD_LIMIT_MB = 25;`;
const [deletedCode] = parseUnifiedDiff(deleteCode);
assert.equal(deletedCode.path, "src/legacy/limits.ts");
assert.equal(deletedCode.change, "deleted");
assert.deepEqual(features(diff(deleteCode)).codePaths, ["src/legacy/limits.ts"]);

// Header-less forms: "--- a/x" then "+++ /dev/null".
const headerlessDoc = `--- a/docs/guide.md
+++ /dev/null
@@ -1,1 +0,0 @@
-# Guide`;
const [headerless] = parseUnifiedDiff(headerlessDoc);
assert.equal(headerless.path, "docs/guide.md");
assert.equal(headerless.change, "deleted");
assert.deepEqual(predictDriftRisk(diff(headerlessDoc)), {
  status: "unavailable",
  reason: "no-code-files",
});
const [headerlessCode] = parseUnifiedDiff(`--- a/src/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const retentionDays = 30;`);
assert.equal(headerlessCode.path, "src/old.ts");
assert.equal(headerlessCode.change, "deleted");

// The other change kinds, and no path is ever /dev/null.
const [added] = parseUnifiedDiff(`diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,1 @@
+export const retentionDays = 30;`);
assert.equal(added.path, "src/new.ts");
assert.equal(added.change, "added");
const [headerlessAdded] = parseUnifiedDiff(`--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,1 @@
+export const retentionDays = 30;`);
assert.equal(headerlessAdded.path, "src/new.ts");
assert.equal(headerlessAdded.change, "added");
const [renamed] = parseUnifiedDiff(`diff --git a/src/old.ts b/src/new.ts
similarity index 90%
rename from src/old.ts
rename to src/new.ts
--- a/src/old.ts
+++ b/src/new.ts
@@ -1,1 +1,1 @@
-export const retentionDays = 30;
+export const retentionDays = 60;`);
assert.equal(renamed.path, "src/new.ts");
assert.equal(renamed.change, "renamed");
assert.equal(parseUnifiedDiff(publicLimit)[0].change, "modified");

for (const text of [deleteDoc, deleteCode, headerlessDoc, `${deleteDoc}\n${publicLimit}`]) {
  for (const file of parseUnifiedDiff(text)) {
    assert.notEqual(file.path, "/dev/null");
  }
}

// Several header-less files in one patch: once a hunk has read the lines its header
// announced, the next "--- " / "+++ " pair opens a new file instead of being read as
// content of the last one. Order does not matter.
const headerlessDocDeletion = `--- a/docs/guide.md
+++ /dev/null
@@ -1,2 +0,0 @@
-# Guide
-Uploads are capped at 25 MB.`;
const headerlessLimitChange = `--- a/src/limits.ts
+++ b/src/limits.ts
@@ -1,2 +1,2 @@
 // Upload limits
-export const MAX_UPLOAD_LIMIT_MB = 25;
+export const MAX_UPLOAD_LIMIT_MB = 50;`;
const limitOnly = features(diff(headerlessLimitChange));
for (const text of [
  `${headerlessDocDeletion}\n${headerlessLimitChange}`,
  `${headerlessLimitChange}\n${headerlessDocDeletion}`,
]) {
  const kinds = parseUnifiedDiff(text).map((file) => `${file.path}:${file.change}`);
  assert.deepEqual(kinds.sort(), ["docs/guide.md:deleted", "src/limits.ts:modified"]);
  const extraction = features(diff(text));
  assert.deepEqual(extraction.docsTouched, ["docs/guide.md"]);
  assert.deepEqual(extraction.codePaths, ["src/limits.ts"]);
  assert.deepEqual(extraction.vector, limitOnly.vector);
  assert.deepEqual(scored(diff(text)), scored(diff(headerlessLimitChange)));
}

// Inside a hunk that has not finished, header-looking lines are still content.
const [unfinished] = parseUnifiedDiff(`--- a/notes.txt
+++ b/notes.txt
@@ -1,2 +1,3 @@
 intro
+--- a/looks-like-a-header
+++ b/also-content
-old`);
assert.equal(unfinished.path, "notes.txt");
assert.equal(unfinished.additions, 2);
assert.equal(unfinished.deletions, 1);

// Header paths: a tab-separated timestamp is not part of the path, and Git's quoted
// paths are decoded (escapes and octal UTF-8 bytes) before the a/ or b/ side is removed.
const timestampedDeletion = `--- a/docs/guide.md\t2026-01-01 00:00:00.000000000 +0000
+++ /dev/null\t1970-01-01 00:00:00.000000000 +0000
@@ -1 +0,0 @@
-# Guide`;
const [timestamped] = parseUnifiedDiff(timestampedDeletion);
assert.equal(timestamped.path, "docs/guide.md");
assert.equal(timestamped.change, "deleted");
assert.deepEqual(predictDriftRisk(diff(timestampedDeletion)), {
  status: "unavailable",
  reason: "no-code-files",
});
const [timestampedEdit] = parseUnifiedDiff(`--- a/src/limits.ts\t2026-01-01 00:00:00
+++ b/src/limits.ts\t2026-01-02 00:00:00
@@ -1 +1 @@
-export const MAX_UPLOAD_LIMIT_MB = 25;
+export const MAX_UPLOAD_LIMIT_MB = 50;`);
assert.equal(timestampedEdit.path, "src/limits.ts");
assert.equal(timestampedEdit.change, "modified");

const quotedDeletion = `diff --git "a/docs/my guide.md" "b/docs/my guide.md"
deleted file mode 100644
--- "a/docs/my guide.md"
+++ /dev/null
@@ -1 +0,0 @@
-# Guide`;
const [quoted] = parseUnifiedDiff(quotedDeletion);
assert.equal(quoted.path, "docs/my guide.md");
assert.equal(quoted.change, "deleted");
assert.deepEqual(predictDriftRisk(diff(quotedDeletion)), {
  status: "unavailable",
  reason: "no-code-files",
});
const [quotedHeaderless] = parseUnifiedDiff(`--- "a/docs/my guide.md"
+++ /dev/null
@@ -1 +0,0 @@
-# Guide`);
assert.equal(quotedHeaderless.path, "docs/my guide.md");
const [octal] = parseUnifiedDiff(`--- "a/docs/caf\\303\\251.md"
+++ "b/docs/caf\\303\\251.md"
@@ -1 +1 @@
-old
+new`);
assert.equal(octal.path, "docs/café.md");
const [escapedTab] = parseUnifiedDiff(`--- "a/src/odd\\tname.ts"
+++ "b/src/odd\\tname.ts"
@@ -1 +1 @@
-old
+new`);
assert.equal(escapedTab.path, "src/odd\tname.ts");

// ---------------------------------------------------------------------------
// Acceptance 11a, continued: the digest covers the whole patch
// ---------------------------------------------------------------------------

const digestOf = (text: string) =>
  diffDigest(parseUnifiedDiff(text, { includeMetadataOnly: true }));

const pureRename = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts`;
const modeOnly = `diff --git a/scripts/run.sh b/scripts/run.sh
old mode 100644
new mode 100755`;
const noNewline = `${publicLimit}\n\\ No newline at end of file`;

// Plumb reads the same lines either way; the digest still tells the patches apart.
assert.deepEqual(parseUnifiedDiff(noNewline)[0].lines, parseUnifiedDiff(publicLimit)[0].lines);
const baseDigest = await digestOf(publicLimit);
assert.notEqual(await digestOf(noNewline), baseDigest);
assert.notEqual(await digestOf(`${publicLimit}\n${pureRename}`), baseDigest);
assert.notEqual(await digestOf(`${publicLimit}\n${modeOnly}`), baseDigest);
assert.notEqual(
  await digestOf(`${publicLimit}\n${pureRename}`),
  await digestOf(`${publicLimit}\n${modeOnly}`),
);
assert.equal(
  await digestOf(`${pureRename}\n${publicLimit}\n${modeOnly}`),
  await digestOf(`${modeOnly}\n${publicLimit}\n${pureRename}`),
);
assert.equal(await digestOf(`${publicLimit}\n`), baseDigest);

// A carriage return a change adds to a line is part of the patch as written. Plumb reads
// the same lines either way, but the digests must differ.
const lfLimitPatch = `--- a/src/limits.ts
+++ b/src/limits.ts
@@ -1 +1 @@
-export const MAX_UPLOAD_LIMIT_MB = 25;
+export const MAX_UPLOAD_LIMIT_MB = 50;`;
const withLf = `${lfLimitPatch}\n`;
const withCr = `${lfLimitPatch}\r\n`;
assert.deepEqual(parseUnifiedDiff(withCr)[0].lines, parseUnifiedDiff(withLf)[0].lines);
assert.equal(parseUnifiedDiff(withCr)[0].path, "src/limits.ts");
assert.notEqual(await digestOf(withCr), await digestOf(withLf));

async function requestDigestOf(text: string) {
  const request = await buildPredictionRequest({
    sourceKind: "diff",
    files: parseUnifiedDiff(text, { includeMetadataOnly: true }),
    documents: [],
    policyConfig,
  });
  return requestDigest(request);
}
assert.notEqual(await requestDigestOf(withCr), await requestDigestOf(withLf));

// Metadata-only files are kept only on request, and never produce a claim.
assert.equal(parseUnifiedDiff(`${publicLimit}\n${pureRename}\n${modeOnly}`).length, 1);
const withMetadata = parseUnifiedDiff(`${publicLimit}\n${pureRename}\n${modeOnly}`, {
  includeMetadataOnly: true,
});
const metadataKinds = withMetadata.map((file) => `${file.path}:${file.change}`);
assert.equal(metadataKinds.length, 3);
assert.equal(metadataKinds[0], "src/config/limits.ts:modified");
assert.equal(metadataKinds[1], "src/new-name.ts:renamed");
assert.equal(metadataKinds[2], "scripts/run.sh:modified");
for (const file of withMetadata.slice(1)) {
  assert.equal(file.lines.length, 0);
  assert.equal(claimsFromDiff(file, BUILT_IN_SUBJECTS, "v").length, 0);
}

// ---------------------------------------------------------------------------
// Entitlement seam
// ---------------------------------------------------------------------------

assert.equal(DEFAULT_TIER, "free");
assert.equal(resolveTier(undefined), "free");
assert.equal(resolveTier({}), "free");
assert.equal(resolveTier({ JURISCORE_TIER: "Team" }), "team");
assert.equal(resolveTier({ JURISCORE_TIER: "enterprise" }), "enterprise");
assert.equal(resolveTier({ JURISCORE_TIER: "admin" }), "free");
assert.equal(capabilityState("free", "local-risk-score"), "available");
assert.equal(capabilityState("enterprise", "local-risk-score"), "available");
assert.equal(capabilityState("free", "model-backed-prediction"), "not-in-tier");
// Entitled but not built yet: roadmap, never a fake working button.
assert.equal(capabilityState("team", "model-backed-prediction"), "roadmap");
assert.equal(capabilityState("team", "self-hosted-model"), "not-in-tier");
assert.equal(capabilityState("enterprise", "self-hosted-model"), "roadmap");

// ---------------------------------------------------------------------------
// Phase C: the workbench drift-risk band
// ---------------------------------------------------------------------------

// The workbench reads every parsed file, and the parser that accepted the text decides
// the source kind.
const workbenchChange = parseConnectedChange(`${harmless}\n${publicLimit}\n${pureRename}`);
assert.equal(workbenchChange.sourceKind, "diff");
assert.equal(workbenchChange.files.length, 3, "metadata-only files are part of the change");
const pastedFile = parseConnectedChange("export const MAX_UPLOAD_LIMIT_MB = 50;\n", "limits.ts");
assert.equal(pastedFile.sourceKind, "snapshot");
assert.equal(pastedFile.files[0].path, "limits.ts");

async function workbenchRiskFor(change: ConnectedChange, documents = [] as DocumentInput[]) {
  const { request, requestDigest: digest } = await buildWorkbenchRequest(change, {
    documents,
    policyConfig,
  });
  const result = await assessWorkbenchRisk(change, request);
  assert.equal(result.envelope.requestDigest, digest, "the envelope answers its own request");
  return result;
}
type DocumentInput = { id: string; content: string };

// The risky file comes second and still drives the score.
const workbenchCombined = await workbenchRiskFor(
  parseConnectedChange(`${harmless}\n${publicLimit}`),
);
assert.equal(workbenchCombined.risk.status, "scored");
if (workbenchCombined.risk.status === "scored") {
  assert.equal(workbenchCombined.risk.score, riskScorePercent(withLimit.score));
  assert.equal(workbenchCombined.risk.band, withLimit.band);
  assert.equal(workbenchCombined.risk.placeholder, true);
  assert.equal(workbenchCombined.risk.maturity, "target");
  assert.ok(workbenchCombined.risk.score >= 0 && workbenchCombined.risk.score <= 100);
  const top = topContributions(workbenchCombined.risk.contributions);
  assert.ok(top.length > 0 && top.length <= 3);
  for (const contribution of top) assert.ok(contribution.contribution > 0);
}
const workbenchHarmless = await workbenchRiskFor(parseConnectedChange(harmless));
assert.ok(
  workbenchHarmless.risk.status === "scored" &&
    workbenchCombined.risk.status === "scored" &&
    workbenchCombined.risk.score > workbenchHarmless.risk.score,
);

// A pasted whole file has no baseline; a docs-only change has no code to score.
const workbenchSnapshot = await workbenchRiskFor(pastedFile);
assert.deepEqual(workbenchSnapshot.risk, {
  status: "unavailable",
  reason: "no-baseline",
  docsTouched: [],
});
assert.deepEqual(workbenchSnapshot.envelope.prediction, {
  status: "unavailable",
  reason: "no-baseline",
});
const workbenchDocsOnly = await workbenchRiskFor(parseConnectedChange(docEdit));
assert.deepEqual(workbenchDocsOnly.risk, {
  status: "unavailable",
  reason: "no-code-files",
  docsTouched: ["docs/limits.md"],
});

// Docs already touched are reported as a fact and do not move the score.
const workbenchWithDoc = await workbenchRiskFor(parseConnectedChange(`${publicLimit}\n${docEdit}`));
const workbenchWithoutDoc = await workbenchRiskFor(parseConnectedChange(publicLimit));
const bothScored =
  workbenchWithDoc.risk.status === "scored" && workbenchWithoutDoc.risk.status === "scored";
assert.ok(bothScored);
if (workbenchWithDoc.risk.status === "scored" && workbenchWithoutDoc.risk.status === "scored") {
  assert.deepEqual(workbenchWithDoc.risk.docsTouched, ["docs/limits.md"]);
  assert.deepEqual(workbenchWithoutDoc.risk.docsTouched, []);
  assert.equal(workbenchWithDoc.risk.score, workbenchWithoutDoc.risk.score);
}
assert.deepEqual(docsTouchedBy(pastedFile), []);

// The envelope the workbench builds carries digests only, never the change or documents.
const workbenchSecret = await workbenchRiskFor({ sourceKind: "diff", files: secretChange }, [
  { id: "doc-1", content: DOC_SECRET },
]);
const workbenchSerialized = serializePredictionEnvelope(workbenchSecret.envelope);
assert.equal(workbenchSerialized.includes(DOC_SECRET), false);
assert.equal(workbenchSerialized.includes(CODE_SECRET), false);

// Verdict independence: the workbench compares the same claims with or without the band.
const workbenchKyc = parseConnectedChange(`diff --git a/src/payments.ts b/src/payments.ts
--- a/src/payments.ts
+++ b/src/payments.ts
@@ -1,1 +1,1 @@
-  kycThreshold: 10_000,
+  kycThreshold: 25_000,`);
const workbenchAuthorities = claimsFor(workbenchKyc.files);
const compareWorkbench = () =>
  compareClaims(workbenchAuthorities, docClaims, { policyIds: ["pii-baseline"] });
const withoutBand = compareWorkbench();
const workbenchBand = await workbenchRiskFor(workbenchKyc, [{ id: "kyc", content: "kyc" }]);
const withBand = compareWorkbench();
assert.deepEqual(withBand, withoutBand);
assert.equal(withoutBand.verdict, "block");
assert.equal("verdict" in workbenchBand.risk, false);

// The stale-result guard, as the workbench runs it: a result is committed only if its
// generation and digest are still the active ones once scoring finishes.
async function runWorkbenchScoring(
  change: ConnectedChange,
  state: { generation: number; active: ActivePredictionRequest | null },
  duringScoring: () => void,
) {
  const generation = ++state.generation;
  state.active = null;
  const { request, requestDigest: digest } = await buildWorkbenchRequest(change, {
    documents: [],
    policyConfig,
  });
  if (state.generation !== generation) return null;
  state.active = { generation, requestDigest: digest };
  const pending = assessWorkbenchRisk(change, request);
  duringScoring();
  const result = await pending;
  const current = await isCurrentPredictionResult(() => state.active, {
    generation,
    envelope: result.envelope,
  });
  return current ? result.risk : null;
}
const scoringState = { generation: 0, active: null as ActivePredictionRequest | null };
const changeA = parseConnectedChange(publicLimit);
assert.notEqual(await runWorkbenchScoring(changeA, scoringState, () => undefined), null);
// Source switched to B while A was scoring: A's result is dropped.
assert.equal(
  await runWorkbenchScoring(changeA, scoringState, () => {
    scoringState.generation += 1;
    scoringState.active = null;
  }),
  null,
);
// A reset or unmount retires the request the same way.
assert.equal(
  await runWorkbenchScoring(changeA, scoringState, () => {
    scoringState.generation += 1;
    scoringState.active = null;
  }),
  null,
);
// Two requests for the same input: only the latest generation is shown, even though
// both carry the same digest.
assert.equal(
  await runWorkbenchScoring(changeA, scoringState, () => {
    const digest = scoringState.active?.requestDigest ?? "";
    scoringState.generation += 1;
    scoringState.active = { generation: scoringState.generation, requestDigest: digest };
  }),
  null,
);

// ---------------------------------------------------------------------------
// Phase C: the local metrics ledger records bands and scores only
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const legacyDay = {
  veil: {
    checks: 1,
    allow: 1,
    revise: 0,
    block: 0,
    occurrences: 2,
    redacted: 2,
    tokenized: 0,
    chars: 10,
  },
  plumb: {
    checks: 2,
    allow: 1,
    revise: 1,
    block: 0,
    assertions: 3,
    matches: 2,
    drifted: 0,
    cannotDetermine: 1,
  },
  receipts: 1,
};
const noRisk = { low: 0, uncertain: 0, high: 0 };
const someRisk = { low: 0, uncertain: 1, high: 1 };
// A ledger saved before drift risk existed loads with zero risk counts and no latest score.
const legacyLedger = normalizeLedger({
  version: 1,
  simulated: false,
  days: { [today]: legacyDay },
} as unknown as LocalMetricsLedger);
assert.deepEqual(legacyLedger.days[today].plumb.risk, noRisk);
assert.equal(legacyLedger.latestRisk, null);
assert.equal(legacyLedger.days[today].plumb.checks, 2);
assert.deepEqual(summarizeTrailingWeek(legacyLedger).plumb.risk, noRisk);
assert.equal(summarizeTrailingWeek(legacyLedger).plumb.checks, 2);

const ledgerDay = legacyLedger.days[today];
const baseRecord = {
  verdict: "allow" as const,
  assertions: 1,
  matches: 1,
  drifted: 0,
  cannotDetermine: 0,
};
addPlumbCheck(ledgerDay, { ...baseRecord, riskBand: "high", riskScore: 81 });
addPlumbCheck(ledgerDay, { ...baseRecord, riskBand: "uncertain", riskScore: 40 });
addPlumbCheck(ledgerDay, { ...baseRecord, riskBand: null, riskScore: null });
addPlumbCheck(ledgerDay, baseRecord);
assert.deepEqual(ledgerDay.plumb.risk, someRisk);
assert.equal(ledgerDay.plumb.checks, 6);
assert.deepEqual(summarizeTrailingWeek(legacyLedger).plumb.risk, someRisk);

const recordedAt = "2026-09-26T00:00:00.000Z";
const unscored = { ...baseRecord, riskBand: null, riskScore: null };
const latestScore = latestRiskAfter(
  null,
  { ...baseRecord, riskBand: "high", riskScore: 81 },
  recordedAt,
);
assert.deepEqual(latestScore, { score: 81, band: "high", at: recordedAt });
// A check without a score (the sample, a snapshot) keeps the previous latest score.
assert.deepEqual(latestRiskAfter(latestScore, unscored, recordedAt), latestScore);
assert.deepEqual(latestRiskAfter(latestScore, baseRecord, recordedAt), latestScore);

// A round trip through storage keeps the new fields and nothing else.
const persisted = normalizeLedger(
  JSON.parse(JSON.stringify({ ...legacyLedger, latestRisk: latestScore })) as LocalMetricsLedger,
);
assert.deepEqual(persisted.latestRisk, latestScore);
assert.deepEqual(persisted.days[today].plumb.risk, someRisk);
const riskKeys = Object.keys(persisted.days[today].plumb.risk).sort();
assert.deepEqual(riskKeys, ["high", "low", "uncertain"]);
assert.deepEqual(Object.keys(persisted.latestRisk ?? {}).sort(), ["at", "band", "score"]);

// The simulated seed is internally consistent with the Plumb tile and the shipped bands.
const seedRisk = SIMULATED_SEED.plumbRisk;
assert.equal(
  seedRisk.counts.low + seedRisk.counts.uncertain + seedRisk.counts.high,
  SIMULATED_SEED.plumb.checks,
);
assert.equal(bandFor(seedRisk.latest.score / 100), seedRisk.latest.band);

console.log("JurisCore predictive drift-risk checks passed.");
