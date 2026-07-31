# Internal prototype validation report

Date: 2026-07-31
Scope: local JurisCore prototype after the Veil and Plumb product reset.

## Outcome

The prototype now supports the agreed story: JurisCore protects model inputs through Veil and validates SaaS assertions through Plumb. Existing prototype routes and demonstrations remain present. Reclaim is documented as roadmap work rather than an active first-release claim.

## Product-story validation

| Question                                                                 | Result | Evidence                                                                                                                      |
| ------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Is JurisCore presented as infrastructure rather than a chatbot?          | Pass   | Landing page describes an open-source validation and guardrail server with API and MCP connection paths                       |
| Does the product have two clear jobs?                                    | Pass   | Protect the prompt through Veil; prove the answer through source validation                                                   |
| Is Veil healthcare-focused without becoming an insurance-claims product? | Pass   | Synthetic clinical and healthcare-operations privacy workflow                                                                 |
| Does Plumb remain a technical SaaS drift evaluator?                      | Pass   | Code-versus-document workbench with implementation and document locators                                                      |
| Is Reclaim preserved without confusing the initial product?              | Pass   | Listed only in roadmap documentation; the existing denial-management demo remains preserved and labeled as prototype material |

## Veil validation

Validated behavior:

- healthcare and all-sensitive-data profiles;
- redaction and consistent tokenization modes;
- separate raw-input and transformed-output verdicts;
- detection of the configured synthetic patient-name, date-of-birth, MRN, member-ID, email, and phone fixtures;
- preservation of the synthetic clinical context;
- findings that omit the detected raw values;
- visible per-document protection summary and review requirement;
- copyable transformed payload;
- browser-local PDF, DOCX, and PNG ingestion with a 25 MB file limit;
- page-by-page extraction for text-based PDFs;
- local OCR for PNG documents;
- source preview for PDFs and PNGs plus editable extracted text;
- consistent aliases for repeated occurrences of detected values;
- simulated weekly Veil overview showing total protected, redacted, and tokenized counts;

A visual test discovered and fixed a cross-line patient-name detector defect that could leave a labeled date of birth visible. A regression assertion now covers that case.

Not yet validated or implemented:

- complete identifier coverage or statistical de-identification;
- output-side inspection of a real model response;
- OCR fallback for image-only multi-page PDFs;
- pixel-faithful DOCX rendering in the browser;
- policy administration;
- production storage, encryption, retention, authorization, or tenant isolation;
- any regulatory-compliance claim.

## Plumb validation

Validated behavior:

- clean implementation facts produce a matches result;
- risky implementation facts produce a drifted result;
- missing authoritative facts produce cannot determine;
- findings include implementation and document locators;
- visible diff values now match the facts evaluated by the comparator;
- switching documents resets stale verdicts.

Not yet validated or implemented:

- automatic claim extraction from arbitrary code or prose;
- semantic model adapter;
- GitHub installation, pull-request checks, or repository permissions;
- scheduled product-promise scans;
- benchmark precision, recall, citation correctness, or calibration.

## Preserved prototype validation

The work, governance, live-demo, connection, and MCP surfaces listed in `FEATURE_INVENTORY.md` remain in the repository and dashboard navigation. The use-case portfolio still includes its previous healthcare and finance demonstrations in addition to Veil and Plumb.

Browser testing found and fixed one pre-existing AI Review hydration mismatch caused by locale-dependent date rendering. Dates now render deterministically in UTC.

## Automated verification

- shared core contract checks: pass;
- Veil deterministic checks: pass;
- Plumb deterministic checks: pass;
- TypeScript check: pass;
- production build: pass;
- formatting and whitespace check: pass;
- changed-file lint checks: pass;
- repository-wide lint: existing formatting backlog remains outside this prototype slice;
- `.env.local` containing the API credential remains ignored by Git.

## Current evidence maturity

All demonstrated outcomes are **Synthetic**. No dashboard metric should be represented as benchmark, pilot, or production evidence.

## Recommended next build slice

Create versioned server endpoints for Veil protection and Plumb comparison using the shared schemas. Add request-size limits, policy identifiers, deterministic receipts, structured error responses, and tests. Keep real patient data, autonomous enforcement, and external repository writes out of scope until authentication, tenant isolation, and security controls exist.
