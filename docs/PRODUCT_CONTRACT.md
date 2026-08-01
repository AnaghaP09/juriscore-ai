# JurisCore product contract

Status: V1 working source of truth. Amended 2026-08-01: sovereign and on-premises repositioning, ratified by the founder.

## Product definition

JurisCore is a commercial AI validation and guardrail platform. It is a guardrail and validation layer that deploys inside the customer's own environment — on-premises, private cloud, or air-gapped. A hosted Team tier is a convenience deployment of the same contract, not a separate product.

The primary storyline is sovereign AI operation: organizations that run their own models, or that must control what reaches external models, use JurisCore to enforce their own policies on every AI input and output and to keep a receipt for every decision. AI-assisted SaaS support and engineering remains the first workload profile. External model providers are guarded, not banned: approved providers are reached only through the gateway, behind Veil, under the provider-adapter principle.

The platform does two jobs:

1. **Control model context.** Detect, transform, or block sensitive and unsafe inputs before they reach a model.
2. **Control product truth.** Validate material claims against authoritative sources before they reach a user, release, or workflow.

The product promise remains: **Protect the prompt. Prove the answer.** Every check returns an allow, revise, or block decision with findings, evidence, active policy versions, and an audit receipt.

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

Plumb checks assertions in documentation, support content, runbooks, release notes, sales material, and AI-generated answers against code, configuration, schemas, policies, and APIs.

### Use case 1: pull-request documentation drift

When a pull request changes an API, limit, price, configuration, or behavior, Plumb checks the associated documentation before merge and identifies the exact source mismatch.

### Use case 2: AI answer and product-promise drift

On demand or on a schedule, Plumb checks generated support answers, Help Center content, sales claims, security documentation, and runbooks against the implemented source of truth.

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

## Commercial model

JurisCore uses a free-entry, paid-expansion model anchored on the self-hosted Enterprise deployment:

- Free gives individuals a local playground, every built-in policy reference, limited Veil and Plumb checks, and a small number of browser-local custom policies. Built-in policy packs are always free.
- Team adds the hosted gateway API and authenticated MCP tools with metered usage, unlimited organization-shared versioned custom policies, shared receipt retention and search, CI checks, and collaboration.
- Enterprise is the self-hosted deployment: an annual per-instance license rather than metered usage; SSO, RBAC, and tenant isolation; private signed policy packs with offline updates and a policy approval workflow; append-only local receipts with export; air-gapped installation; contractual assurances and priority support.

The metering unit is the check. One Veil check is one protection evaluation of one document or prompt; one Plumb check is one comparison run. Metering records counts, digests, verdicts, and policy versions only; raw content is never stored or transmitted for billing. No tier is sold as compliance; policy packs guide checks and do not certify.

## V1 boundary

V1 will:

- demonstrate Veil on synthetic SaaS and optional healthcare data;
- apply active built-in or custom policies to Veil and Plumb receipts;
- demonstrate Plumb on structured code-versus-document fixtures;
- preserve existing prototype routes;
- run without external network calls at evaluation time;
- expose deterministic checks and clearly label simulated evidence.

V1 will not claim complete de-identification, automatic compliance, production-grade secret detection, benchmark results not reproduced, autonomous merge authority, or production tenant isolation. V1 will also not claim network-egress enforcement, certified air-gap operation, or authenticated multi-user operation until the gateway API, authentication, and receipt persistence exist.

## Product principles

1. JurisCore is the platform; Veil and Plumb are features.
2. Evidence before fluency.
3. Sensitive values do not belong in findings or logs.
4. Policy versions belong in every receipt.
5. Cannot determine is a valid outcome.
6. Consequential actions remain under human control.
7. Model providers are replaceable adapters.
8. Metrics declare whether they are targets, synthetic, benchmark, pilot, or production results.
