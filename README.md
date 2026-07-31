# JurisCore

JurisCore is an open-source AI validation and guardrail server. It protects sensitive information before it reaches a model and validates material assertions against authoritative sources before they reach a user.

The two flagship modules are **JurisCore Veil**, a healthcare-focused privacy workflow, and **Plumb**, a source-of-truth drift evaluator for technical SaaS products. **JurisCore Reclaim** remains a future roadmap workflow that will compose both capabilities.

This repository currently preserves the exported Lovable prototype. Several screens and MCP tools use deterministic demo data; production services, persistence, authentication, and integrations will be implemented against the project requirements.

The working product scope and measurement rules are documented in [the product contract](docs/PRODUCT_CONTRACT.md), [the evaluation plan](docs/EVALUATION_PLAN.md), [the prototype gap analysis](docs/PROTOTYPE_GAP_ANALYSIS.md), [the internal feature inventory](docs/FEATURE_INVENTORY.md), and [the latest prototype validation report](docs/VALIDATION_REPORT.md).

## Local development

Prerequisites:

- [Bun](https://bun.sh/)

Install dependencies and start the development server:

```sh
bun install
bun run dev
```

Run the available project checks:

```sh
bun run lint
bun run build
```

## Project status

This is the initial prototype baseline. Product requirements and evaluation observations are being reviewed separately before the production architecture and implementation roadmap are finalized.

## Licensing

No open-source license has been selected yet. Until a license is added, all rights are reserved.
