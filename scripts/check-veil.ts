import assert from "node:assert/strict";
import { protectText } from "../src/lib/juriscore/veil/engine";
import {
  SENSITIVE_FIXTURE_VALUES as sensitiveFixtureValues,
  SYNTHETIC_CLINICAL_NOTE as syntheticClinicalNote,
  SYNTHETIC_PDF_TABLE_EXTRACTION as syntheticPdfTableExtraction,
} from "./fixtures/veil-fixtures";

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
// Document upload path: the workbench runs every document through the all-sensitive
// profile, and extracted PDF form fields arrive as label / column gap / value.
const fromPdf = protectText(syntheticPdfTableExtraction, {
  profile: "all_sensitive",
  strategy: "redact",
});

assert.equal(fromPdf.rawVerdict, "block");
assert.doesNotMatch(fromPdf.sanitizedText, /Maya Patel/);
assert.doesNotMatch(fromPdf.sanitizedText, /04\/12\/1982/);
assert.doesNotMatch(fromPdf.sanitizedText, /88742199/);
assert.doesNotMatch(fromPdf.sanitizedText, /HMO-44912003/);
assert.doesNotMatch(fromPdf.sanitizedText, /\(415\) 555-0199/);
assert.match(fromPdf.sanitizedText, /Type 2 diabetes/);
for (const value of sensitiveFixtureValues) {
  assert.equal(
    JSON.stringify(fromPdf.findings).includes(value),
    false,
    `raw value leaked into findings: ${value.slice(0, 3)}...`,
  );
}
assert.equal(
  fromPdf.findings.some((finding) => finding.category === "patient_name"),
  true,
);
assert.equal(
  fromPdf.findings.some((finding) => finding.category === "date_of_birth"),
  true,
);
assert.equal(
  fromPdf.findings.some((finding) => finding.category === "phone"),
  true,
);

// A single space is prose, not a table column, and must not be read as a labelled field.
assert.equal(
  protectText("The clinic asked whether Name Badge Policy applies.", {
    profile: "all_sensitive",
  }).findings.some((finding) => finding.category === "patient_name"),
  false,
);

assert.equal(protectText("Clinical context only.").rawVerdict, "allow");
assert.equal(
  protectText("A member identifier is required for the workflow.").findings.some(
    (finding) => finding.category === "insurance_member_id",
  ),
  false,
);

console.log("JurisCore Veil checks passed.");
