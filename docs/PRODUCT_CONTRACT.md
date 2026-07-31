# JurisCore product contract

Status: working source of truth for product and implementation decisions.

## Product definition

JurisCore is an open-source AI validation and guardrail server. Applications place it around an AI model to do two things:

1. **Protect what goes into AI.** Detect, transform, or block sensitive inputs before they reach a model.
2. **Prove what comes out of AI.** Validate material assertions against authoritative sources before they reach a user or workflow.

The product promise is: **Protect the prompt. Prove the answer.**

JurisCore is infrastructure rather than another chatbot. It returns a structured allow, revise, or block decision with findings, evidence, and an audit receipt.

## Product flow

1. A trusted application submits content and a validation policy.
2. JurisCore applies input detectors and transformations.
3. Only permitted content is sent to the selected model provider.
4. JurisCore evaluates the returned content or another candidate artifact.
5. The server returns a verdict, evidence, and review requirements.
6. The application records or acts on that result according to its policy.

Model providers are adapters. Validation policy, evidence, verdicts, and audit records belong to JurisCore.

## Flagship modules

| Module         | Role                                                 | Product question                                                      |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| JurisCore Veil | Sensitive-data protection before and after model use | Is this information permitted to reach or leave the model?            |
| Plumb          | Source-of-truth validation for SaaS artifacts        | Does this assertion still agree with the implemented source of truth? |

Both modules share policy configuration, detectors, assertion contracts, evidence references, verdicts, human-review controls, evaluation tooling, and audit receipts.

## JurisCore Veil

Veil is a healthcare-focused privacy workflow built on the JurisCore input and output guardrails. It detects selected categories of personal, health, financial, and secret data; transforms them using redaction or controlled tokens; and exposes exactly what changed before content is sent onward.

### Use case 1: safe clinical-document assistance

A healthcare worker wants an LLM to summarize or restructure a clinical note. Veil detects configured identifiers, shows a preview, produces a sanitized copy, and checks the model response for accidental sensitive-data exposure.

### Use case 2: safe healthcare-operations assistance

A billing, coding, support, or revenue-cycle team wants an LLM to classify, summarize, or draft from patient-related material. Veil removes or tokenizes prohibited identifiers while preserving permitted operational and clinical context.

Veil is not represented as HIPAA compliant merely because it performs pattern detection. Deployment controls, data flows, contractual requirements, access controls, retention, and independent validation remain separate obligations.

## Plumb

Plumb is the JurisCore source-integrity module for technical SaaS products. It compares claims in documentation or product-facing artifacts with authoritative implementation sources and returns matches, drifted, or cannot determine with citations on both sides.

### Use case 1: pull-request documentation drift

When a pull request changes an API, configuration, price, limit, or operational behavior, Plumb checks related READMEs, API documentation, and runbooks before merge.

### Use case 2: product-promise drift

On demand or on a schedule, Plumb compares Help Center content, product documentation, sales claims, security documentation, and runbooks with code, configuration, schemas, and APIs.

## Shared server capabilities

The durable server will own:

- policy and rule configuration;
- detector and transformation pipelines;
- source ingestion, provenance, and versioning;
- provider-neutral model execution;
- assertion extraction and source validation;
- evidence references with exact locators;
- allow, revise, and block verdicts;
- human-review requirements and decisions;
- tenant boundaries and authorization;
- append-only audit receipts;
- evaluation datasets, runs, and maturity labels;
- versioned APIs for Lovable and other clients.

## First release boundary

The first usable release will:

- run Veil against synthetic healthcare text using configurable redaction or tokenization;
- show the original, transformed output, findings, and verdicts without storing detected raw values in findings;
- run Plumb against structured code-versus-document fixtures;
- return supported, drifted, or cannot-determine findings with source locators;
- preserve existing prototype routes and demonstrations;
- expose shared machine-readable contracts and deterministic checks;
- clearly label simulated metrics and model behavior.

The first release will not:

- claim that regular-expression detection is complete de-identification;
- make an autonomous medical, legal, coverage, or compliance decision;
- send real patient information through a prototype workflow;
- claim a benchmark result that has not been reproduced;
- train a model on customer data by default;
- make Plumb an autonomous merge authority;
- treat a model confidence score as proof.

## Roadmap: JurisCore Reclaim

Reclaim is a future healthcare denial-evidence and appeal-preparation workflow. It will compose both sides of JurisCore: Veil protects patient information, while the validation engine checks appeal assertions against payer policy and permitted clinical evidence. Reclaim is not part of the initial product claim or first release.

## Product principles

1. Evidence before fluency.
2. Sensitive values do not belong in findings or logs.
3. A transformed input and an original input receive separate verdicts.
4. Cannot determine is a valid outcome.
5. Consequential actions remain under human control.
6. Model providers are replaceable adapters.
7. Metrics must declare whether they are targets, synthetic, benchmark, pilot, or production results.
8. Lovable is the prototype layer; the repository and server contracts are the durable source of truth.
