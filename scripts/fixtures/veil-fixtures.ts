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

// Shape of what DOCX extraction hands the engine for an invoice: cell boundaries arrive
// as a single tab, and a remittance block carries bank, tax, address, and contact values
// that no healthcare or secrets detector covers. All values below are synthetic.
export const SYNTHETIC_INVOICE_EXTRACTION = `INVOICE
Northstar Meridian Systems Ltd.
7800 Meridian Plaza, Suite 420
Port Arbor, CA 90000
Tax ID: SAMPLE-94-0002718
billing@northstarmeridian.example.invalid
Bill to
Blue Oak Dynamics Corporation
245 Innovation Crescent
Account: SYN-ACCT-2049
Customer success lead: Jordan Vale
Enterprise platform subscription — 500 licensed users
TOTAL DUE	$36,973.00
Payment method	Sample remittance details
ACH / wire	Fictional Unity Commercial Bank • Routing: 000000000 • Account: SAMPLE-0091842 • SWIFT: SAMPLEXXX
Check	Northstar Meridian Systems Ltd., Lockbox 00027, Port Arbor, CA 90000
Questions	billing@northstarmeridian.example.invalid • 415-555-0142`;

export const SENSITIVE_INVOICE_VALUES = [
  "000000000",
  "SAMPLE-0091842",
  "SAMPLEXXX",
  "SAMPLE-94-0002718",
  "SYN-ACCT-2049",
  "Jordan Vale",
  "7800 Meridian Plaza",
  "245 Innovation Crescent",
  "Port Arbor, CA 90000",
  "billing@northstarmeridian.example.invalid",
  "415-555-0142",
];
