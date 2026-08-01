import assert from "node:assert/strict";
import { protectText } from "../src/lib/juriscore/veil/engine";
import { SYNTHETIC_CLINICAL_NOTE as syntheticClinicalNote } from "./fixtures/veil-fixtures";

const redacted = protectText(syntheticClinicalNote, {
  profile: "healthcare",
  strategy: "redact",
});

assert.equal(redacted.rawVerdict, "block");
assert.equal(redacted.sanitizedVerdict, "allow");
assert.equal(redacted.requiresReview, true);
assert.doesNotMatch(redacted.sanitizedText, /Maya Patel/);
assert.doesNotMatch(redacted.sanitizedText, /04\/12\/1982/);
assert.doesNotMatch(redacted.sanitizedText, /88742199/);
assert.doesNotMatch(redacted.sanitizedText, /maya\.patel@example\.test/);
assert.match(redacted.sanitizedText, /Type 2 diabetes/);
assert.equal(JSON.stringify(redacted.findings).includes("Maya Patel"), false);
assert.equal(JSON.stringify(redacted.findings).includes("88742199"), false);
assert.equal(
  redacted.findings.some((finding) => finding.category === "date_of_birth"),
  true,
);

const tokenized = protectText(syntheticClinicalNote, {
  profile: "healthcare",
  strategy: "tokenize",
});

assert.equal(tokenized.sanitizedText.match(/\[EMAIL_1\]/g)?.length, 2);
assert.equal(tokenized.sanitizedText.match(/\[PATIENT_NAME_1\]/g)?.length, 2);
assert.doesNotMatch(tokenized.sanitizedText, /Maya Patel/);
assert.equal(protectText("Clinical context only.").rawVerdict, "allow");
assert.equal(
  protectText("A member identifier is required for the workflow.").findings.some(
    (finding) => finding.category === "insurance_member_id",
  ),
  false,
);

console.log("JurisCore Veil checks passed.");
