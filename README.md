# JurisCore V1 Platform

JurisCore is a commercial AI validation and guardrail platform for teams building AI into SaaS products. It protects data before model use, validates important claims against authoritative sources, and returns an allow, revise, or block decision with evidence.

JurisCore has two core features:

- **Veil** protects customer, operational, security, and regulated data before it enters or leaves an AI workflow.
- **Plumb** checks documentation and product claims against code, configuration, schemas, policies, and APIs.

Both features use the same Policy Library. The prototype includes versioned references for PII, HIPAA, SOC 2, MITRE ATLAS, NIST AI RMF, and NIST CSF, plus browser-local custom policies. Policy packs guide checks; they do not certify compliance.

## Commercial model

JurisCore is not an open-source product. The intended model is product-led and usage-based:

- **Free:** local playground, built-in policy references, and limited Veil and Plumb checks.
- **Team:** metered API usage, custom policies, shared receipts, CI checks, and collaboration.
- **Enterprise:** SSO, RBAC, private policy packs, dedicated data controls, and priority support.

The source in this repository is a private product prototype and remains all rights reserved.

## Local development

Prerequisites:

- [Bun](https://bun.sh/)

```sh
bun install
bun run dev
```

Run the core validation suite and production build:

```sh
bun run check:core
bun run build
```

See [the product contract](docs/PRODUCT_CONTRACT.md), [feature inventory](docs/FEATURE_INVENTORY.md), and [validation report](docs/VALIDATION_REPORT.md) for current scope and evidence maturity.

## Licensing

Copyright © JurisCore. All rights reserved. No open-source license is granted.
