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
- removed from navigation: intake, matters, contracts, hearings, and AI review; superseded the same day by the full-deletion decision recorded below;
- the MCP tools must be rewired from the legacy mock engine to the shared Veil and Plumb engines, and the MCP server self-description must drop the finance-and-healthcare framing;
- principle-8 defects filed for correction: the hard-coded precision dial in the CISO view, the hard-coded weekly Veil overview totals, the simulated MCP metrics tool, and the mock rulebook coverage figures; each must gain a maturity label or leave the visible product;
- completed: `remix-of-juricore/` was archived out of the repository to `../remix-of-juricore-archived-2026-08-01` on 2026-08-01.

Addendum, same date — distribution, requested by the founder:

- the static product page in `landing/` is published through GitHub Pages; the running app is not — it requires the server runtime for the MCP endpoints;
- a downloadable on-prem package (versioned release archive plus container image) becomes the Free-tier and Enterprise install path; releases ship built artifacts only, gated on the deterministic checks; specification in `SPEC_DISTRIBUTION.md`;
- validation receipts for Veil and Plumb are the next build slice; specification in `SPEC_RECEIPTS.md`.

Addendum, same date — legal-ops surface deletion, founder decision:

- the founder reviewed intake, matters, contracts, hearings, and AI review and found no purpose for them in the product; they are removed entirely, not preserved in code; this is the explicit product decision that the preservation rule at the end of this document requires;
- deletion scope: `src/routes/dashboard.intake.tsx`, `src/routes/dashboard.matters.tsx`, `src/routes/dashboard.contracts.tsx`, `src/routes/dashboard.hearings.tsx`, `src/routes/dashboard.ai-review.tsx`, their Work navigation group in `src/routes/dashboard.tsx`, and `src/lib/juriscore/legal-mock.ts` once the Overview rebuild (`SPEC_OVERVIEW.md`) removes its last import;
- sequencing: the Overview rebuild lands first; the deletion follows as its own commit with `bun run check:core` and `bun run build` green and no remaining references to the deleted modules;
- the Work surfaces list below is retained as a historical record of the Lovable prototype only; those surfaces are no longer preserved.

Addendum, same date — Veil protection-profile simplification, founder decision:

- the Veil workbench drops the profile selector; every run uses the all-sensitive profile, so the default posture is that everything sensitive is protected unless an active policy says otherwise — the right default for the sovereign buyer, who should not have to choose a narrower posture to get protection;
- this is a product-surface simplification, not an engine change: the profiles remain in `src/lib/juriscore/veil/engine.ts`, and `scripts/check-veil.ts` continues to exercise the healthcare profile;
- healthcare protection ships as engine capability plus the HIPAA policy pack rather than a UI selector, which matches the contract wording ("an optional Veil policy profile through the HIPAA reference pack");
- trade-off accepted: scoped protection (protect less to preserve more context) is deferred; when it returns, it returns as policy-driven configuration attached to packs in the Policy Library, not as a dropdown;
- contract wording was checked against this decision on the same date and remains accurate; no contract change required.

Addendum, same date — Overview weekly metrics, founder instruction:

- the Overview shows populated weekly metrics: one overall tile and one each for Veil and Plumb, including the amount of data protected;
- implementation is a locally persisted metrics ledger of real per-check aggregates (trailing 7 days, this device, labeled live); by founder decision the page ships populated by default with fixed simulated seed values, badged "Simulated" on every tile, which the first real check evicts and Reset demo restores; specification in `SPEC_OVERVIEW.md`;
- the ledger stores numeric aggregates only — never text, findings, or digests; no unlabeled number may appear;
- the server-side, receipt-backed weekly metrics remain the roadmap item recorded above.

Addendum, same date — use-case portfolio archived, founder instruction:

- the use-case portfolio and drill-down (`src/routes/dashboard.use-cases.tsx`, `src/routes/dashboard.use-cases.$key.tsx`) are archived for later use: the code is preserved in the repository, and the surface is removed from all navigation, including the Demos strip;
- this supersedes the earlier same-date decision that demoted the portfolio into Demos;
- unlike the deleted legal-ops surfaces, these routes are explicitly not deleted — the per-use-case structure (persona, capability, value, risk) is a candidate frame for future workload profiles once real per-use-case metrics and receipts exist;
- the archived routes remain reachable by direct URL until the nav-group slice lands; that is accepted for V1 and they must not be linked from any kept or demoted surface.

Addendum, same date — surface naming consistency, founder instruction:

- the receipts surface currently carries three names: the left navigation says "Audit Log" (`src/routes/dashboard.tsx:78`), the page titles itself "Audit log" under a "Receipts" eyebrow (`src/routes/dashboard.audit.tsx:47-48`), and the ratified navigation names it Receipts;
- canonical name: **Receipts** — it is the ratified surface name and the product's own vocabulary (every check returns an audit receipt); the navigation label and the page title both become "Receipts"; the route path `/dashboard/audit` is unchanged this slice;
- rule going forward: for every surface, the navigation label and the page title are the same string; any rename changes both in the same commit;
- while the page still lists synthetic entries, its description must not read as a production claim ("give this to your auditor"); the page keeps a visible demo-data label until receipts persist.

Addendum, same date — Live Demo group removed; LLM Gateway promoted with a Beta label, founder instruction:

- the "Live Demo" navigation group is removed;
- the LLM Gateway moves into the primary JurisCore navigation group with a "Beta" badge next to its label;
- boundary condition: the gateway page is currently a simulation (mock engine, fabricated latencies) and `MODEL_CONNECTION_REQUIREMENTS.md` forbids implying a live model connection; "Beta" marks the surface's product status, and the page keeps its visible simulated labeling until the versioned gateway API replaces the simulation — at which point Beta becomes accurate without a copy change;
- the primary navigation is therefore: Overview, Veil, Plumb, Policy Library, Receipts, LLM Gateway (Beta), plus MCP Connect;
- with no Demos group remaining, pipeline, analytics, and the CISO view are removed from navigation with code preserved, joining the archived surfaces; the Overview's planned Demos strip is dropped;
- open item: the emergency-stop control lives on the CISO view; when the gateway API lands, the control moves to the gateway surface (its natural home); until then it remains reachable at its route (owner: product, decide with the gateway slice).

Addendum, same date — release versioning convention established:

- releases are date-based: `YYYY.MM.DD`, one heading per release, newest first, in `docs/RELEASE_NOTES.md`; the first entry is `2026.08.01 — V1 platform`;
- date-based versioning is chosen because no release has been cut, the product has no public API surface to promise compatibility against, and a semantic version would imply stability guarantees this prototype cannot make; a semantic scheme replaces it when the gateway API ships a versioned contract;
- release notes are buyer-facing public copy published as a subpage of the product site; they carry the same rules as the product: every number carries a maturity label, corrections to prior overclaims are stated plainly rather than omitted, and no capability is described that does not exist;
- release notes are sourced only from this repository's own history and files.

## Existing features to preserve

### Public and connection surfaces

- landing page;
- dashboard shell and model selector;
- MCP connection guide;
- MCP list-tools and invoke-tool routes;
- prompt checking, policy retrieval, citation enforcement, response evaluation, audit lookup, and metrics tools.

### Work surfaces (historical — deleted by the 2026-08-01 founder decision above)

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
