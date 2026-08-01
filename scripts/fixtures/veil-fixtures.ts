export const SYNTHETIC_CLINICAL_NOTE = `Patient: Maya Patel
DOB: 04/12/1982
MRN: 88742199
Member ID: HMO-44912003
Email: maya.patel@example.test
Phone: 415-555-0199
Clinical context: Type 2 diabetes follow-up with medication adherence discussed.
Maya Patel reported no new symptoms.
Contact maya.patel@example.test after review.`;

// Verbatim shape of what browser-local PDF extraction hands the engine for a form or
// table layout: the label and its value are separate cells, so the colon is gone and the
// column gap survives as runs of spaces.
export const SYNTHETIC_PDF_TABLE_EXTRACTION = `--- Page 1 ---
Patient Name   Maya Patel
Date of Birth   04/12/1982
MRN   88742199
Member ID   HMO-44912003
Contact  (415) 555-0199
Signed: Maya Patel, RN
Clinical context: Type 2 diabetes follow-up.`;

export const SENSITIVE_FIXTURE_VALUES = [
  "Maya Patel",
  "04/12/1982",
  "88742199",
  "HMO-44912003",
  "maya.patel@example.test",
  "415-555-0199",
];
