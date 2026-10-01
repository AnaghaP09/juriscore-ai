# JurisCore product contract

Status: V1 working source of truth. Amended 2026-08-01: sovereign and on-premises repositioning, ratified by the founder. Updated 2026-10-01 to match the build on `main` (v2026.10.01).

## Product definition

JurisCore is a commercial AI validation and guardrail platform. It is a guardrail and validation layer that deploys inside the customer's own environment — on-premises, private cloud, or air-gapped. A hosted Team tier is a convenience deployment of the same contract, not a separate product.

The primary storyline is sovereign AI operation: organizations that run their own models, or that must control what reaches external models, use JurisCore to enforce their own policies on every AI input and output and to keep a receipt for every decision. AI-assisted SaaS support and engineering remains the first workload profile. External model providers are guarded, not banned: approved providers are reached only through the gateway, behind Veil, under the provider-adapter principle.

The platform does two jobs:

1. **Control model context.** Detect, transform, or block sensitive and unsafe inputs before they reach a model.
2. **Control product truth.** Validate material claims against authoritative sources before they reach a user, release, or workflow.

The product promise remains: **Protect the prompt. Prove the answer.** Every check returns an allow, revise, or block decision with findings, evidence and the active policy versions. A receipt is written for the checks listed under "Receipts" below.

## Product structure

JurisCore is the product and platform. Veil and Plumb are features within it.

| Feature | Role | Product question |
| --- | --- | --- |
| Veil | Data and prompt protection around model use | Is this context permitted to enter or leave the AI workflow? |
| Plumb | Source-of-truth validation for SaaS artifacts | Does this claim still agree with the authoritative technical source? |

The features share the Policy Library, verdict contracts, evidence references, human review controls, evaluation tooling, and audit receipts.

## Veil

Veil is versatile input and output protection for AI-assisted SaaS work. It detects selected personal identifiers, customer and tenant identifiers, credentials, secrets, regulated health identifiers, and prompt-attack patterns. It can redact values when identity is irrelevant or tokenize them when relationships must be preserved.

### Use case 1: support and incident copilots

A support engineer wants an AI model to summarize a ticket, incident transcript, or log bundle. Veil protects customer contact details, tenant identifiers, database URLs, access tokens, and other configured values while retaining the technical failure pattern.

### Use case 2: engineering copilots

A developer wants an AI model to explain logs, review configuration, or draft a runbook. Veil blocks or transforms credentials and prompt attacks while preserving the code and operational context needed to troubleshoot.

Healthcare remains an optional Veil policy profile through the HIPAA reference pack. It is not the platform's defining storyline.

## Plumb

Plumb compares numeric assertions in a document against the value in code. Today it extracts three built-in subjects: the KYC threshold, the cross-border fee and the data-retention days. For each subject it takes the first sentence in the selected document that names the subject with a number; later sentences about the same subject are not checked. Values are compared as written: a code value of `-1` for retention is compared as minus one, not as "keep forever". Sources come from pasted diff or source text, a public GitHub pull request fetched on request, and uploaded documents that carry the assertions. The MCP tool `compare_claims` compares claims the caller supplies in structured form. Extraction of other claim types (prices, limits, API behaviour) is planned, not shipped.

### Use case 1: pull-request documentation drift

When a pull request changes a value Plumb knows, a person runs the check in the workbench: Plumb compares the selected document with the change and names the line where the extracted assertion disagrees. A check installed in the repository that runs before merge is roadmap.

### Use case 2: AI answer and product-promise drift

On demand, Plumb checks generated support answers, Help Center content, sales claims, security documentation, and runbooks against the implemented source of truth, within the subjects above. Scheduled scans are roadmap.

## Shared Policy Library

The Policy Library provides versioned evaluation packs for both features. V1 includes:

- PII and sensitive-data baseline mapped to the NIST Privacy Framework;
- HIPAA Privacy Rule reference from HHS;
- SOC 2 Trust Services Criteria reference from AICPA;
- MITRE ATLAS AI threat reference;
- NIST AI RMF 1.0 and Generative AI Profile;
- NIST Cybersecurity Framework 2.0;
- custom organizational policies created by users.

Built-in packs store source title, publisher, URL, version, and retrieval date. They translate references into product checks but do not reproduce restricted standards, determine legal applicability, certify compliance, or replace qualified review.

## Receipts

A receipt holds the verdict, the finding ids, the policy versions and digests. It never holds prompt, reply or document text. Receipts are kept in the browser's own history (newest 200), optionally copied to a folder the user chooses, and can be downloaded. This is a browser-local history, not a durable audit trail; retention and search across users are roadmap.

A receipt is written:

- in the Veil workbench, once per run, at the first Copy, Save report or Download receipt;
- in the Plumb workbench, after every completed check;
- in the LLM Gateway, after every completed run, including blocked, declined and truncated results.

No receipt is written for:

- the built-in sample inputs (an edited sample is a real run);
- the MCP tools (`check_prompt`, `compare_claims`, `evaluate_response`), which return results only; no MCP tool writes a receipt in this build;
- a gateway run that fails at the provider (the page shows the error and the model drops to "not verified");
- a gateway run cleared before its answer arrives;
- a run whose digest cannot be computed in the browser (the UI shows an error and offers no download).

## Commercial model (proposed)

This section describes the intended tiers. None of the tier controls is built: there is no login, no usage limit, no shared storage and no authenticated MCP. What ships today is the local product described under "V1 boundary". The tier module in the code (`src/lib/juriscore/predict/entitlements.ts`) covers the predictive features only: the local risk score is available, the rest is reported as roadmap or as outside the chosen tier, and nothing is enforced.

JurisCore uses a free-entry, paid-expansion model anchored on the self-hosted Enterprise deployment:

- Free gives individuals a local playground, every built-in policy reference, limited Veil and Plumb checks, and a small number of browser-local custom policies. Built-in policy packs are always free.
- Team adds the hosted gateway API and authenticated MCP tools with metered usage, unlimited organization-shared versioned custom policies, shared receipt retention and search, CI checks, and collaboration.
- Enterprise is the self-hosted deployment: an annual per-instance license rather than metered usage; SSO, RBAC, and tenant isolation; private signed policy packs with offline updates and a policy approval workflow; append-only local receipts with export; air-gapped installation; contractual assurances and priority support.

The metering unit is the check. One Veil check is one protection evaluation of one document or prompt; one Plumb check is one comparison run. Metering records counts, digests, verdicts, and policy versions only; raw content is never stored or transmitted for billing. No tier is sold as compliance; policy packs guide checks and do not certify.

## V1 boundary

V1 (v2026.10.01) does:

- run Veil on pasted text and uploaded documents, with redaction or tokenization, under the active built-in or custom policies;
- run Plumb on a diff plus documents, or on a public pull request, for the three built-in subjects;
- show advisory residual-exposure and drift-risk scores from placeholder weights, labelled as such;
- write receipts as listed above and keep them in the browser history;
- let users create, edit and delete custom policies in this browser;
- send protected prompts to the user's own LLM provider through the optional gateway and check the reply with Veil;
- label simulated evidence and sample results on the linked pages (Overview, Veil, Plumb, Policy Library, Receipts, LLM Gateway). The unlinked analytics route still shows unlabelled mock figures.

Network: the Veil and Plumb engines and the predictors make no network calls. The page itself loads its fonts from Google Fonts on every load, so opening the app contacts Google unless that request is blocked. Three more paths go out, each on a user action: fetching a public pull request from api.github.com, downloading the OCR engine files for scanned documents, and gateway calls to the configured provider (including its connection check). Nothing enforces network egress; that stays a deployment matter.

Removed: the legal-operations routes and their mock data. The pipeline, analytics, use-cases and CISO routes still exist at their URLs but are not linked from navigation.

V1 does not claim complete de-identification, automatic compliance, production-grade secret detection, measured detection accuracy, benchmark results, autonomous merge authority, tenant isolation, network-egress enforcement, certified air-gap operation, or authenticated multi-user operation.

## Product principles

1. JurisCore is the platform; Veil and Plumb are features.
2. Evidence before fluency.
3. Sensitive values do not belong in findings or logs.
4. Policy versions belong in every receipt.
5. Cannot determine is a valid outcome.
6. Consequential actions remain under human control.
7. Model providers are replaceable adapters.
8. Metrics declare whether they are targets, synthetic, benchmark, pilot, or production results.
