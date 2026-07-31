# JurisCore evaluation plan

This plan separates desired targets from demonstrated results. No target may be presented as achieved until a reproducible evaluation run supports it.

## What must be true

JurisCore is useful only if it reduces sensitive-data exposure and unsupported assertions without destroying the information users need or creating intolerable false alarms.

## Shared contract evaluation

Deterministic checks validate policy selection, verdicts, evidence references, source locators, human-review requirements, audit receipts, and provider-adapter behavior. Sensitive raw values must never appear in findings or ordinary logs.

## Veil evaluation

Use synthetic and properly governed labeled text containing direct identifiers, quasi-identifiers, secrets, and clinically relevant non-identifying context.

Measure:

- precision and recall for each configured detector category;
- residual sensitive-data leakage after transformation;
- transformation correctness and token consistency;
- preservation of permitted clinical and operational meaning;
- false positives that remove necessary information;
- output-side leakage detection;
- policy-specific behavior for redact, tokenize, allow, and block;
- reviewer changes and overrides;
- processing latency and failure behavior.

The first prototype uses transparent deterministic detectors. It demonstrates the workflow but does not establish complete de-identification or regulatory compliance.

## Plumb evaluation

Use labeled assertion/source pairs from public Git repositories and controlled fixtures. Include matches, direct contradictions, stale statements, ambiguous statements, missing sources, and incompatible comparisons.

Measure:

- precision and recall for material drift;
- citation correctness on both the assertion and implementation sides;
- cannot-determine behavior when evidence is missing;
- confidence calibration when confidence is shown;
- false-positive reviewer feedback;
- behavior across changed code, configuration, schemas, and APIs.

## Security and operations

Test authorization, tenant isolation, secret handling, audit integrity, deletion and retention behavior, model-provider timeouts, rate limits, prompt injection, malicious documents, sensitive-data leakage, and failures between transformation and model execution.

## Proposed release gates

These are provisional targets, not current product claims.

| Area                       | Proposed gate                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Veil residual leakage      | No known high-severity fixture value remains after the configured transformation                                              |
| Veil detector quality      | Report precision and recall separately for every supported detector category; do not publish a single blended accuracy number |
| Sensitive findings         | No raw detected value appears in a finding or audit receipt                                                                   |
| Plumb citation correctness | At least 95% of presented citations resolve to the correct source location and support the finding                            |
| Plumb precision            | At least 85% on labeled material-drift findings                                                                               |
| Plumb recall               | At least 70% on labeled material drift                                                                                        |
| Human control              | 100% of configured block or review outcomes require an explicit application or reviewer action                                |
| Traceability               | 100% of evaluated outputs can be reconstructed from permitted inputs, policy versions, source versions, and audit receipts    |
| Isolation                  | No cross-tenant data exposure in automated authorization tests                                                                |

## Evidence maturity labels

Every metric shown in the product must carry one of these labels:

- **Target**: a desired threshold with no completed evaluation.
- **Synthetic**: measured only on generated fixtures.
- **Benchmark**: measured on a versioned labeled dataset.
- **Pilot**: observed with representative users in a controlled workflow.
- **Production**: observed from deployed operation under a documented measurement definition.

The existing Lovable dashboard contains simulated numbers. They must remain labeled as demo or target data until replaced by reproducible results.
