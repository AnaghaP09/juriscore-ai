import assert from "node:assert/strict";
import { compareClaims, type PlumbClaim } from "../src/lib/juriscore/plumb/engine";

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

console.log("JurisCore Plumb checks passed.");
