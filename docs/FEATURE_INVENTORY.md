# Internal feature inventory

This inventory prevents accidental loss of prototype work while JurisCore is refocused around Veil and Plumb.

## Existing features to preserve

### Public and connection surfaces

- landing page;
- dashboard shell and model selector;
- MCP connection guide;
- MCP list-tools and invoke-tool routes;
- prompt checking, policy retrieval, citation enforcement, response evaluation, audit lookup, and metrics tools.

### Work surfaces

- intake;
- matters;
- contracts;
- hearings;
- AI review.

### Governance surfaces

- overview and analytics;
- use-case portfolio and drill-down;
- audit log;
- rulebooks;
- CISO gateway;
- emergency stop and demo reset.

### Demonstrations

- LLM gateway;
- governance pipeline;
- documentation-versus-code drift workbench;
- redaction sandbox.

These routes may be relabeled, connected to shared engines, or marked as demo data. They must not be deleted without an explicit product decision.

## New work in the current build

- revised JurisCore protect-and-prove product contract;
- JurisCore Veil branding and healthcare privacy workflow;
- browser-local PDF, DOCX, and PNG document ingestion for Veil;
- PDF and PNG source previews plus editable extracted text;
- multi-page PDF text extraction and PNG OCR progress handling;
- per-document Veil protection summary and simulated weekly overview metrics;
- primary navigation placement for Veil and Plumb directly after Overview;
- reusable Veil detector and transformation engine;
- context-preserving tokens for repeated detected values;
- safe findings that omit detected raw values;
- separate raw-input and sanitized-output verdicts;
- reusable Plumb structured source-claim comparator;
- supported, drifted, and cannot-determine Plumb results;
- shared validation and evidence contracts;
- deterministic Veil, Plumb, and contract checks;
- maturity labels for simulated or target metrics;
- additive landing-page and navigation updates;
- external Redact-versus-Tokenize use-case and decision guide.

## Roadmap work, not an initial product claim

- JurisCore Reclaim denial-evidence and appeal-preparation workflow;
- production persistence and migrations;
- authentication, role-based access, and tenant isolation;
- production audit receipts;
- receipt-backed weekly Veil metrics to replace the simulated overview totals;
- real provider adapters and output-side model validation;
- source ingestion and retrieval services;
- GitHub pull-request integration for Plumb;
- independent privacy, security, and benchmark validation;
- Lovable interface regeneration after the source contracts stabilize.
