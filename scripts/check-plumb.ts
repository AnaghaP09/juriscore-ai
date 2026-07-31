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

console.log("JurisCore Plumb checks passed.");
