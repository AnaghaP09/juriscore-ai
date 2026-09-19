import assert from "node:assert/strict";
import { compareClaims, type PlumbClaim } from "../src/lib/juriscore/plumb/engine";
import {
  BUILT_IN_SUBJECTS,
  claimsFromDiff,
  claimsFromDocument,
  documentSentences,
  parseRepositoryInput,
  parseUnifiedDiff,
} from "../src/lib/juriscore/plumb/sources";

const reference = (sourceId: string, locator: string) => ({
  sourceId,
  sourceVersion: "sha256:synthetic-v1",
  locator,
});

const authorities: PlumbClaim[] = [
  {
    id: "code-fee",
    subject: "cross_border_fee",
    value: 2.5,
    unit: "percent",
    statement: "crossBorderFeeBps: 250",
    reference: reference("payments.ts", "line 45"),
  },
  {
    id: "code-threshold",
    subject: "kyc_threshold",
    value: 25_000,
    unit: "USD",
    statement: "kycThreshold: 25_000",
    reference: reference("payments.ts", "line 42"),
  },
];

const assertions: PlumbClaim[] = [
  {
    id: "doc-fee",
    subject: "cross_border_fee",
    value: 1,
    unit: "percent",
    statement: "Cross-border fees remain capped at 1%.",
    reference: reference("pricing.md", "paragraph 2"),
  },
  {
    id: "doc-threshold",
    subject: "kyc_threshold",
    value: 25_000,
    unit: "USD",
    statement: "Enhanced review begins above $25,000.",
    reference: reference("kyc.md", "paragraph 4"),
  },
  {
    id: "doc-retention",
    subject: "retention_days",
    value: 30,
    unit: "days",
    statement: "Events are retained for 30 days.",
    reference: reference("operations.md", "paragraph 8"),
  },
];

const result = compareClaims(authorities, assertions);

assert.equal(result.verdict, "block");
assert.deepEqual(result.counts, {
  matches: 1,
  drifted: 1,
  cannot_determine: 1,
});
assert.equal(result.findings[0].authority?.reference.locator, "line 45");
assert.equal(result.findings[2].authority, null);

// Two documents contradicting the same change are two findings, not one. The workbench
// highlights every drift, so the engine must report each with its own source pair.
assert.equal(result.findings.filter((finding) => finding.status === "drifted").length, 1);
const bothDrift = compareClaims(authorities, [
  {
    id: "doc-fee",
    subject: "cross_border_fee",
    value: 1,
    unit: "percent",
    statement: "Fees capped at 1%.",
    reference: reference("pricing.md", "paragraph 2"),
  },
  {
    id: "doc-threshold",
    subject: "kyc_threshold",
    value: 10_000,
    unit: "USD",
    statement: "Enhanced review begins above $10,000.",
    reference: reference("kyc.md", "paragraph 4"),
  },
]);
assert.equal(bothDrift.counts.drifted, 2);
assert.deepEqual(
  bothDrift.findings
    .filter((f) => f.status === "drifted")
    .map((f) => f.assertion.reference.locator),
  ["paragraph 2", "paragraph 4"],
);

const claim = (over: Partial<PlumbClaim>): PlumbClaim => ({
  id: "c",
  subject: "kyc_threshold",
  value: 25_000,
  statement: "s",
  reference: reference("src", "loc"),
  ...over,
});

// A value that arrived as text is not a contradiction when it means the same thing.
// Reporting drift here would block a merge over two sources that agree.
assert.equal(
  compareClaims([claim({ value: 25_000 })], [claim({ value: "25000" })]).findings[0].status,
  "matches",
);
assert.equal(
  compareClaims([claim({ value: 2.5 })], [claim({ value: " 2.5 " })]).findings[0].status,
  "matches",
);
assert.equal(
  compareClaims([claim({ value: true })], [claim({ value: "true" })]).findings[0].status,
  "matches",
);
// Genuinely different values still drift.
assert.equal(
  compareClaims([claim({ value: 25_000 })], [claim({ value: "10000" })]).findings[0].status,
  "drifted",
);

// Units differ in formatting, not meaning.
assert.equal(
  compareClaims([claim({ unit: "USD" })], [claim({ unit: "usd" })]).findings[0].status,
  "matches",
);
assert.equal(
  compareClaims([claim({ unit: "percent" })], [claim({ unit: "USD" })]).findings[0].status,
  "cannot_determine",
);

// Sources that corroborate each other are not ambiguous; conflicting ones are.
assert.equal(
  compareClaims([claim({ id: "a" }), claim({ id: "b" })], [claim({})]).findings[0].status,
  "matches",
);
assert.equal(
  compareClaims([claim({ id: "a" }), claim({ id: "b", value: 10_000 })], [claim({})]).findings[0]
    .status,
  "cannot_determine",
);

// A run that compared nothing has verified nothing and must not read as a pass.
assert.equal(compareClaims(authorities, []).verdict, "revise");

// ---------------------------------------------------------------------------
// Sources: a real repository and real documents
// ---------------------------------------------------------------------------

assert.deepEqual(parseRepositoryInput("https://github.com/AnaghaP09/juriscore-ai"), {
  owner: "AnaghaP09",
  repo: "juriscore-ai",
});
assert.deepEqual(parseRepositoryInput("git@github.com:AnaghaP09/juriscore-ai.git"), {
  owner: "AnaghaP09",
  repo: "juriscore-ai",
});
assert.deepEqual(parseRepositoryInput("AnaghaP09/juriscore-ai"), {
  owner: "AnaghaP09",
  repo: "juriscore-ai",
});
assert.equal(parseRepositoryInput("not a repository"), null);
assert.equal(parseRepositoryInput(""), null);

const samplePatch = `diff --git a/src/payments.ts b/src/payments.ts
index 337d924..e6dca5a 100644
--- a/src/payments.ts
+++ b/src/payments.ts
@@ -40,7 +40,7 @@
 export const payments = {
-  kycThreshold: 10_000,
+  kycThreshold: 25_000,
   currency: "USD",
-  crossBorderFeeBps: 100, // 1.0%
+  crossBorderFeeBps: 250, // 2.5%
 };`;

const [patched] = parseUnifiedDiff(samplePatch);
assert.equal(patched.path, "src/payments.ts");
assert.equal(patched.additions, 2);
assert.equal(patched.deletions, 2);
// Added lines are numbered against the new file, removed lines against the old one.
assert.equal(patched.lines.find((line) => line.text.includes("25_000"))?.n, 41);

// Header patterns are only headers before the first hunk. A line the change adds that
// happens to start with "+++" or "index " is content, and dropping it would quietly
// remove a claim from the comparison.
const contentThatLooksLikeHeaders = `diff --git a/notes.md b/notes.md
--- a/notes.md
+++ b/notes.md
@@ -1,2 +1,5 @@
 intro
+++ divider
+index of terms
+  retentionDays: 30,
-index stale
`;
const [notes] = parseUnifiedDiff(contentThatLooksLikeHeaders);
assert.equal(notes.path, "notes.md");
assert.equal(notes.additions, 3);
assert.equal(notes.deletions, 1);

const codeClaimsFromPatch = claimsFromDiff(patched, BUILT_IN_SUBJECTS, "pr-2431");
assert.equal(codeClaimsFromPatch.length, 2);
const kyc = codeClaimsFromPatch.find((c) => c.subject === "kyc_threshold");
assert.equal(kyc?.value, 25_000);
assert.equal(kyc?.unit, "USD");
assert.equal(kyc?.reference.sourceId, "src/payments.ts");
// Basis points are converted to the percent the documents are written in; comparing
// 250 against 2.5 would otherwise report drift where the two sources agree.
const fee = codeClaimsFromPatch.find((c) => c.subject === "cross_border_fee");
assert.equal(fee?.value, 2.5);
assert.equal(fee?.unit, "percent");

const filing = `Our Know-Your-Customer program applies enhanced due diligence to any single transaction exceeding $10,000.
Cross-border remittance fees disclosed to retail customers remain capped at 1.0% of principal.
The Company maintains independent oversight of all pricing changes.`;
const filingClaims = claimsFromDocument(documentSentences(filing), BUILT_IN_SUBJECTS, {
  sourceId: "10-k.pdf",
  sourceVersion: "sha256:synthetic",
});
assert.equal(filingClaims.length, 2);
assert.equal(filingClaims.find((c) => c.subject === "kyc_threshold")?.value, 10_000);
assert.equal(filingClaims.find((c) => c.subject === "cross_border_fee")?.value, 1);

// A figure carrying a currency marker wins over a bare number earlier in the sentence.
const noisy = claimsFromDocument(
  documentSentences("KYC review covers 2 account types for amounts exceeding $10,000."),
  BUILT_IN_SUBJECTS,
  { sourceId: "d", sourceVersion: "v" },
);
assert.equal(noisy[0]?.value, 10_000);

// "$10K" in a sales deck means the same threshold the filing states.
const deckClaims = claimsFromDocument(
  documentSentences("KYC verification runs automatically for any transaction over $10K."),
  BUILT_IN_SUBJECTS,
  { sourceId: "deck", sourceVersion: "v" },
);
assert.equal(deckClaims[0]?.value, 10_000);

// A sentence about a known subject that carries no number yields no claim, rather than
// a guessed one.
assert.equal(
  claimsFromDocument(
    documentSentences("KYC thresholds are governed centrally."),
    BUILT_IN_SUBJECTS,
    { sourceId: "p", sourceVersion: "v" },
  ).length,
  0,
);

// End to end: a real patch against a real filing is the drift the workbench shows.
const endToEnd = compareClaims(codeClaimsFromPatch, filingClaims, { policyIds: ["pii-baseline"] });
assert.equal(endToEnd.verdict, "block");
assert.equal(endToEnd.counts.drifted, 2);

console.log("JurisCore Plumb checks passed.");
