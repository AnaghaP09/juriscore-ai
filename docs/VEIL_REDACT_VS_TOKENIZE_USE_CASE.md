# JurisCore Veil: Redact vs Tokenize

**Use-case and decision guide**  
Version 0.1 · 31 July 2026 · Prototype validation

## Executive summary

JurisCore Veil protects sensitive information before a document or prompt reaches an AI model. It offers two transformation strategies:

- **Redact** when the model does not need to know that repeated mentions refer to the same person or identifier.
- **Tokenize** when the model must preserve relationships across a document without seeing the underlying identity.

The decision is therefore not simply about stronger versus weaker privacy. It is a trade-off between **data minimization** and **referential continuity**.

**The business rule in one line:** Redact when the task is about the content. Tokenize when the task depends on relationships. Redaction is the disclosure-minimizing default; tokenization is a utility exception justified by a continuity requirement.

> **Default decision rule:** Use Redact unless the downstream task has a documented need to connect repeated references to the same entity.

## Core definitions

### Redact

Redaction replaces a detected sensitive value with an irreversible category label.

**Example**

- Original: `Patient: Maya Patel`
- Redacted: `Patient: [REDACTED_PATIENT_NAME]`

Use redaction when the downstream model only needs the surrounding clinical, operational, or legal context. The replacement communicates what type of information was removed, but not whether two removed values were originally identical.

### Tokenize

Tokenization replaces a detected sensitive value with a consistent pseudonymous token. Repeated instances of the same value receive the same token during the processing operation.

**Example**

- Original first mention: `Patient: Maya Patel`
- Original later mention: `Maya Patel reported no new symptoms.`
- Tokenized: `Patient: [PATIENT_NAME_1]`
- Tokenized later mention: `[PATIENT_NAME_1] reported no new symptoms.`

This continuity lets the model follow a person, account, claim, or identifier through the document without receiving the original value.

**Prototype terminology note:** JurisCore Veil currently implements context-preserving pseudonymization. It does not maintain a token vault or support controlled re-identification. Vault-backed reversible tokenization is a future production capability.

## Decision matrix

| Decision factor                             | Redact  | Tokenize                               |
| ------------------------------------------- | ------- | -------------------------------------- |
| Identity visible to model                   | No      | No                                     |
| Repeated references remain linkable         | No      | Yes, within the processed document     |
| Best for data minimization                  | Yes     | Conditional                            |
| Best for longitudinal reasoning             | Limited | Yes                                    |
| Re-identification supported                 | No      | No, not in the current prototype       |
| Default for external/general-purpose models | Yes     | Only with a documented continuity need |

## Selection workflow

1. **Does the model need the sensitive value itself?** If yes, do not use the current prototype as an automatic release mechanism; require an authorized workflow and human review.
2. **Does the model need to connect repeated mentions to the same entity?** If no, use Redact.
3. **Would losing entity continuity materially damage the task?** If yes, use Tokenize.
4. **Does the output need to be mapped back to the original identity automatically?** If yes, the current prototype is insufficient; use a future vault-backed workflow with access controls and audit logging.
5. **Has the protected output been reviewed?** Treat both strategies as guardrails, not proof of complete de-identification.

## Healthcare use cases

### Use case 1: External model summarization

**Scenario:** A team wants a concise summary of a clinical note using a general-purpose external model.

**Recommended strategy:** Redact.

**Why:** The model usually needs diagnoses, treatment context, and requested output structure, but not direct identifiers. Removing linkability reduces unnecessary disclosure.

### Use case 2: Longitudinal care-team handoff

**Scenario:** A long document refers repeatedly to the patient, caregiver, clinician, and member identifier. The model must produce a coherent handoff.

**Recommended strategy:** Tokenize.

**Why:** Consistent tokens preserve who did what across the document while hiding the underlying identifiers.

### Use case 3: Denial-document analysis for a future Reclaim workflow

**Scenario:** A denial packet contains a patient, insurer member ID, clinicians, and multiple dates. The model is asked to organize evidence before a human prepares an appeal.

**Recommended strategy:** Tokenize during evidence organization; Redact for any external excerpt that does not require entity continuity.

**Why:** Internal reasoning may require consistent references, while exported material should minimize disclosure.

### Use case 4: Policy or rubric comparison

**Scenario:** The model compares de-identified clinical reasoning against a policy, rubric, or coverage criterion.

**Recommended strategy:** Redact.

**Why:** Identity relationships are normally irrelevant to the policy comparison.

## Worked example

### Original

```text
Patient: Maya Patel
DOB: 04/12/1982
MRN: 88742199
Member ID: HMO-44912003

Maya Patel reported no new adverse effects. Call Maya Patel after the review.
```

### Redacted

```text
Patient: [REDACTED_PATIENT_NAME]
DOB: [REDACTED_DOB]
MRN: [REDACTED_MRN]
Member ID: [REDACTED_MEMBER_ID]

[REDACTED_PATIENT_NAME] reported no new adverse effects. Call [REDACTED_PATIENT_NAME] after the review.
```

### Tokenized

```text
Patient: [PATIENT_NAME_1]
DOB: [DOB_1]
MRN: [MRN_1]
Member ID: [MEMBER_ID_1]

[PATIENT_NAME_1] reported no new adverse effects. Call [PATIENT_NAME_1] after the review.
```

## Controls and product boundaries

- Uploaded PDF, DOCX, and PNG files are processed in the browser in the current prototype.
- Text-based PDFs are extracted page by page. A PDF containing only scanned images must be converted to PNG for OCR in the current version.
- DOCX content is normalized into editable text; original Word layout is not reproduced pixel for pixel.
- PNG text extraction uses local browser OCR and can require an OCR language-model download on first use. The document image is not intentionally sent to JurisCore servers.
- The prototype enforces a 25 MB single-document limit.
- Detector coverage is configuration-dependent and may miss identifiers or over-transform non-sensitive text.
- Redaction and tokenization do not establish HIPAA compliance, complete de-identification, or legal admissibility.
- A human should review the protected text before it is released to a downstream model.

## Prototype validation checklist

- Upload a text-based multi-page PDF and confirm all pages appear in extracted text.
- Upload a DOCX and confirm paragraph text is readable and editable.
- Upload a high-resolution PNG and confirm OCR text can be corrected before protection.
- Confirm Redact removes linkability where the configured detector finds repeated values.
- Confirm Tokenize assigns the same token to repeated instances of the same value.
- Confirm the raw file is not persisted in a JurisCore finding or transformation receipt.
- Confirm unsupported, empty, and oversized files produce a clear error.
- Confirm the protected output can be copied without copying the original content.

## Roadmap implications

The production roadmap should add encrypted temporary processing, configurable retention, malware scanning, scanned-PDF OCR, broader file-type support, tenant-level detector profiles, token-vault integration where reversible workflows are required, persistent audit receipts, role-based access controls, and benchmarked detection/OCR quality.
