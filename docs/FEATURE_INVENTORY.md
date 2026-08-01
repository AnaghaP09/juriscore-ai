# Internal feature inventory

This inventory prevents accidental loss of prototype work while JurisCore is refocused around Veil and Plumb.

## V1 platform reset — 2026-07-31

- JurisCore is now a commercial platform, not an open-source server;
- Veil and Plumb are features inside JurisCore rather than separate modules;
- the primary storyline is AI-assisted SaaS support and engineering;
- healthcare protection remains an optional Veil policy profile;
- the Policy Library includes versioned PII, HIPAA, SOC 2, MITRE ATLAS, NIST AI RMF, and NIST CSF references;
- users can create and activate browser-local custom policies;
- active policy identifiers and versions flow into Veil and Plumb evaluation receipts;
- the intended business model is free entry, metered Team usage, and Enterprise controls;
- previous routes and preserved demonstrations remain in the V1 copy unless explicitly removed later.

## Product decision — 2026-08-01: sovereign repositioning and navigation reset

Ratified by the founder on 2026-08-01; the contract amendment is recorded in `PRODUCT_CONTRACT.md`.

- JurisCore's primary deployment is customer-controlled: on-premises, private cloud, or air-gapped; the hosted Team tier is a convenience deployment of the same contract;
- the primary storyline is sovereign AI operation; AI-assisted SaaS support and engineering remains the first workload profile;
- the primary navigation is reduced to six surfaces plus MCP Connect: Overview, Veil, Plumb, Policy Library, Receipts, Demos;
- the Policy Library is promoted into the primary JurisCore navigation group and remains a first-class platform component;
- demoted into the single Demos entry and labeled as simulated data: LLM gateway, governance pipeline, analytics, use-case portfolio and drill-down, and the CISO gateway; the emergency-stop control is retained;
- removed from navigation with code preserved: intake, matters, contracts, hearings, and AI review;
- the MCP tools must be rewired from the legacy mock engine to the shared Veil and Plumb engines, and the MCP server self-description must drop the finance-and-healthcare framing;
- principle-8 defects filed for correction: the hard-coded precision dial in the CISO view, the hard-coded weekly Veil overview totals, the simulated MCP metrics tool, and the mock rulebook coverage figures; each must gain a maturity label or leave the visible product;
- completed: `remix-of-juricore/` was archived out of the repository to `../remix-of-juricore-archived-2026-08-01` on 2026-08-01.

Addendum, same date — distribution, requested by the founder:

- the static product page in `landing/` is published through GitHub Pages; the running app is not — it requires the server runtime for the MCP endpoints;
- a downloadable on-prem package (versioned release archive plus container image) becomes the Free-tier and Enterprise install path; releases ship built artifacts only, gated on the deterministic checks; specification in `SPEC_DISTRIBUTION.md`;
- validation receipts for Veil and Plumb are the next build slice; specification in `SPEC_RECEIPTS.md`.

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
- versioned gateway API for Veil protection and Plumb comparison;
- real provider adapters and output-side model validation;
- approved-provider connections from the gateway and the MCP connect surface to proprietary model providers (Anthropic, OpenAI, Azure OpenAI, Google, and others), so an organization can route to approved external models through Veil; external providers are guarded, not banned; provider credentials stay server-side and every provider remains a replaceable adapter; the current UI shows greyed-out placeholder connection buttons that perform no connection and must not imply one;
- source ingestion and retrieval services;
- GitHub pull-request integration for Plumb;
- independent privacy, security, and benchmark validation;
- Lovable interface regeneration after the source contracts stabilize.
