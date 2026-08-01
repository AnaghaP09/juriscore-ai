import assert from "node:assert/strict";
import { validationReceiptSchema } from "../src/lib/juriscore/core/contracts";
import {
  createReceipt,
  encodePolicyVersion,
  receiptFileName,
  serializeReceipt,
  sha256Hex,
} from "../src/lib/juriscore/core/receipts";
import { protectText } from "../src/lib/juriscore/veil/engine";
import { veilReceiptInput } from "../src/lib/juriscore/veil/receipt";
import { compareClaims, type PlumbClaim } from "../src/lib/juriscore/plumb/engine";
import { plumbReceiptInput } from "../src/lib/juriscore/plumb/receipt";
import { SENSITIVE_FIXTURE_VALUES, SYNTHETIC_CLINICAL_NOTE } from "./fixtures/veil-fixtures";

const CREATED_AT = "2026-08-01T00:00:00.000Z";

// Cross-runtime SHA-256 known-answer anchor (empty string).
assert.equal(
  await sha256Hex(""),
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
);

// Canonical policyVersion encoding: id-sorted, delimiter-sanitized, "none" when empty.
assert.equal(encodePolicyVersion([]), "none");
assert.equal(
  encodePolicyVersion([
    { id: "soc2-tsc", version: "2017 TSC with March 2020 updates" },
    { id: "pii-baseline", version: "JurisCore 2026.07" },
  ]),
  "pii-baseline@JurisCore 2026.07; soc2-tsc@2017 TSC with March 2020 updates",
);
assert.equal(
  encodePolicyVersion([{ id: "custom@one;two", version: "v1;draft" }]),
  "custom-one-two@v1-draft",
);

// Veil receipt: parses, deterministic digest, and never carries a raw fixture value.
const veilRun = protectText(SYNTHETIC_CLINICAL_NOTE, {
  profile: "healthcare",
  strategy: "redact",
  policyIds: ["pii-baseline", "hipaa-privacy"],
});
const veilPolicies = [
  { id: "pii-baseline", version: "JurisCore 2026.07" },
  { id: "hipaa-privacy", version: "45 CFR Parts 160 and 164" },
];
const veilReceipt = await createReceipt({
  ...veilReceiptInput(veilRun, SYNTHETIC_CLINICAL_NOTE, veilPolicies),
  createdAt: CREATED_AT,
});
validationReceiptSchema.parse(veilReceipt);
assert.equal(veilReceipt.module, "veil");
assert.equal(veilReceipt.verdict, "block");
assert.equal(veilReceipt.maturity, "synthetic");
assert.equal(
  veilReceipt.policyVersion,
  "hipaa-privacy@45 CFR Parts 160 and 164; pii-baseline@JurisCore 2026.07",
);
assert.equal(veilReceipt.id, `receipt.veil.${CREATED_AT}.${veilReceipt.inputDigest.slice(0, 8)}`);
assert.match(veilReceipt.inputDigest, /^[0-9a-f]{64}$/);

const serializedVeilReceipt = serializeReceipt(veilReceipt);
for (const value of SENSITIVE_FIXTURE_VALUES) {
  assert.equal(serializedVeilReceipt.includes(value), false);
}

const repeatReceipt = await createReceipt({
  ...veilReceiptInput(veilRun, SYNTHETIC_CLINICAL_NOTE, veilPolicies),
  createdAt: "2026-08-02T00:00:00.000Z",
});
assert.equal(repeatReceipt.inputDigest, veilReceipt.inputDigest);
const changedReceipt = await createReceipt({
  ...veilReceiptInput(veilRun, `${SYNTHETIC_CLINICAL_NOTE} changed`, veilPolicies),
  createdAt: CREATED_AT,
});
assert.notEqual(changedReceipt.inputDigest, veilReceipt.inputDigest);

const noPolicyReceipt = await createReceipt({
  ...veilReceiptInput(veilRun, SYNTHETIC_CLINICAL_NOTE, []),
  createdAt: CREATED_AT,
});
assert.equal(noPolicyReceipt.policyVersion, "none");

// Windows-safe receipt filenames: no colons or dots besides the extension.
assert.equal(receiptFileName(veilReceipt).includes(":"), false);
assert.match(receiptFileName(veilReceipt), /^juriscore-veil-receipt-[0-9TZ-]+\.json$/);

// Plumb drifted receipt: block verdict with excerpt-free evidence on both sides.
const authority: PlumbClaim = {
  id: "code-fee",
  subject: "cross_border_fee",
  value: 2.5,
  unit: "percent",
  statement: "crossBorderFeeBps: 250",
  reference: { sourceId: "payments.ts", sourceVersion: "synthetic-pr-2431", locator: "line 45" },
};
const assertionClaim: PlumbClaim = {
  id: "doc-fee",
  subject: "cross_border_fee",
  value: 1,
  unit: "percent",
  statement: "Fees remain capped at 1.0% of principal.",
  reference: {
    sourceId: "sec-10k-excerpt",
    sourceVersion: "synthetic-pr-2431",
    locator: "s2",
    excerpt: "Fees remain capped at 1.0% of principal.",
  },
};
const plumbRun = compareClaims([authority], [assertionClaim], { policyIds: ["soc2-tsc"] });
const plumbReceipt = await createReceipt({
  ...plumbReceiptInput(
    plumbRun,
    { authorities: [authority], assertions: [assertionClaim] },
    [{ id: "soc2-tsc", version: "2017 TSC with March 2020 updates" }],
  ),
  createdAt: CREATED_AT,
});
validationReceiptSchema.parse(plumbReceipt);
assert.equal(plumbReceipt.module, "plumb");
assert.equal(plumbReceipt.verdict, "block");
assert.equal(plumbReceipt.evidence.length, 2);
assert.equal(serializeReceipt(plumbReceipt).includes('"excerpt"'), false);
assert.equal(serializeReceipt(plumbReceipt).includes(assertionClaim.statement), false);

// Cannot-determine is a valid, receipted outcome: revise verdict, still parses.
const orphanAssertion: PlumbClaim = {
  id: "doc-kyc",
  subject: "kyc_threshold",
  value: 10_000,
  unit: "USD",
  statement: "KYC verification runs for any transaction over $10K.",
  reference: { sourceId: "sales-deck-v12", sourceVersion: "synthetic-pr-2431", locator: "d2" },
};
const cannotDetermineRun = compareClaims([], [orphanAssertion], { policyIds: ["soc2-tsc"] });
assert.equal(cannotDetermineRun.counts.cannot_determine, 1);
const cannotDetermineReceipt = await createReceipt({
  ...plumbReceiptInput(
    cannotDetermineRun,
    { authorities: [], assertions: [orphanAssertion] },
    [{ id: "soc2-tsc", version: "2017 TSC with March 2020 updates" }],
  ),
  createdAt: CREATED_AT,
});
validationReceiptSchema.parse(cannotDetermineReceipt);
assert.equal(cannotDetermineReceipt.verdict, "revise");

console.log("JurisCore receipt checks passed.");
