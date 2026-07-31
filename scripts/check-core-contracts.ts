import assert from "node:assert/strict";
import {
  JURISCORE_PRODUCT,
  governedAssertionSchema,
  reclaimCaseSchema,
} from "../src/lib/juriscore/core/contracts";

const supportedAssertion = {
  id: "assertion-1",
  text: "The supplied record documents the required conservative treatment.",
  material: true,
  status: "supported" as const,
  evidence: [
    {
      sourceId: "clinical-record-1",
      sourceVersion: "sha256:fixture-v1",
      locator: "page 2, paragraph 3",
      excerpt: "Synthetic fixture evidence only.",
    },
  ],
  reason: "The cited passage directly supports the assertion.",
  confidence: 0.94,
};

const approvedCase = {
  id: "case-1",
  tenantId: "tenant-fixture",
  title: "Synthetic denial fixture",
  evidenceSourceIds: ["clinical-record-1"],
  assertions: [supportedAssertion],
  review: {
    status: "approved" as const,
    reviewerId: "reviewer-fixture",
    rationale: "All material assertions are supported by the fixture evidence.",
    decidedAt: "2026-07-31T00:00:00.000Z",
  },
};

assert.equal(JURISCORE_PRODUCT.modules.veil.name, "JurisCore Veil");
assert.equal(JURISCORE_PRODUCT.modules.plumb.name, "Plumb");
assert.equal(JURISCORE_PRODUCT.roadmap.reclaim.name, "JurisCore Reclaim");
assert.equal(reclaimCaseSchema.parse(approvedCase).review.status, "approved");

assert.throws(() =>
  governedAssertionSchema.parse({
    ...supportedAssertion,
    evidence: [],
  }),
);

assert.throws(() =>
  reclaimCaseSchema.parse({
    ...approvedCase,
    assertions: [
      {
        ...supportedAssertion,
        status: "insufficient_evidence",
        evidence: [],
        confidence: null,
      },
    ],
  }),
);

console.log("JurisCore core contract checks passed.");
