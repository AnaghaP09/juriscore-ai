# JurisCore AI Release Notes

JurisCore AI is a guardrail and validation layer for AI workloads. It runs inside your own environment and gives you two core engines:

- **Veil** detects and protects sensitive data in prompts, model responses, and documents.
- **Plumb** checks AI-generated or changed content against your source of truth and flags drift.

Every check produces a **validation receipt**, a downloadable record of what was checked, which policies applied, and the verdict.

---

## Version 2026.10.01

**Release date:** 30 September 2026
**Download:** [Package v2026.10.01](https://github.com/AnaghaP09/juriscore-ai/releases/tag/v2026.10.01) · [All releases](https://github.com/AnaghaP09/juriscore-ai/releases)

### At a glance

| Area | Status in this release |
|---|---|
| Deployment | Self-hosted, single server (default port 8080) |
| Model providers | Anthropic. Additional providers are on the roadmap. |
| Authentication | Not available. Restrict network access to the server. |
| Data storage | The server stores no customer data. Receipts and custom policies are stored in the user's browser. |
| Scores and metrics | Every number is labeled with its maturity level. Detection accuracy is not yet validated on production workloads. |

### Summary

JurisCore AI now connects to a live large language model (LLM) through a governed gateway, validates your own code and documents instead of sample data, and keeps a reviewable history of validation receipts.

### New features

**LLM Gateway is out of beta**
Send prompts to a live model with Veil protection on both sides of the exchange. Veil checks every prompt before it leaves your environment and every response before it reaches the user. Each completed run generates a validation receipt. Your provider API key stays on the server and never reaches the browser. This release supports Anthropic as the model provider.

**Guided gateway setup**
Select **Set up gateway** in the header to get a suggested unlock phrase and step-by-step setup instructions. Setup takes two values: your provider API key and an unlock phrase. In this release, the gateway works from the server's own machine. Remote access is on the roadmap.

**Plumb validates your own sources**
Paste a diff, fetch a public GitHub pull request by number, or upload your own documents. Plumb now reads every file in a change, not only the first. Your sources stay in memory and clear when you close the page. Private repositories are not yet supported.

**Receipt history**
The Receipts page now shows a live history of your checks, stored in your browser (up to 200 records). Filter, export, and delete receipts, or verify a receipt against its original input. The server stores nothing.

**Advisory risk scores**
Veil now shows a residual-exposure score and Plumb shows a drift-risk score, with trends on the Overview page. These scores are advisory. They use expert-set weights, not a trained model, and they never change a verdict.

### Enhancements

- **Policy Library:** Edit and delete your custom policies. Receipts that reference a deleted policy remain readable.
- **Veil detection for financial data:** Veil now detects bank routing and account numbers, IBAN, SWIFT codes, tax IDs, postal addresses, and contact names. Tables in PDF and DOCX files keep their column structure, so Veil finds labeled values more reliably.
- **Streamlined navigation:** Navigation now includes Overview, Veil, Plumb, Policy Library, Receipts, and LLM Gateway.

### Resolved issues that affect results

- Plumb no longer reports drift when only the format differs. For example, `30` and `"30"`, `true` and `"true"`, and equivalent values in different units now match.
- Plumb no longer returns an "allow" verdict when there is nothing to compare. It now reports an empty comparison.
- Plumb now reads every file in a multi-file change. Previously, it missed claims in files after the first.
- The gateway now blocks the request entirely when Veil detects sensitive data on its second pass. The model is never called.

### Removed or deprecated

- **Reset demo** is removed from the dashboard.
- **MCP Connect** is unavailable in the console and marked "Coming soon". The `/mcp` endpoint still responds without authentication to anyone who can reach the server. See Known issues.
- **Demos** is removed from the navigation.

### Updates to previous release notes

Three statements in the 2026.08.01 release notes no longer apply:

| Previous statement | Current behavior |
|---|---|
| "Nothing is persisted." | The browser now stores receipts, custom policies, and metric counts on the user's device. The server still stores nothing. |
| "No external network calls." | Three features make outbound calls: fetching a public GitHub pull request, image text extraction (OCR files download from a public CDN on first use), and the LLM Gateway when enabled. Veil and Plumb checks make no network calls. |
| "A receipt for every run." | A run does not produce a receipt if the model provider fails or times out after the prompt is sent, or if you clear a run while it is in progress. |

### Known issues

Review these issues before you use JurisCore AI with production data.

| # | Issue | Impact | Recommended action |
|---|---|---|---|
| 1 | Veil does not detect some secrets. It recognizes keys by known prefixes such as `sk-`, but misses values written as `api_key=...`, AWS secret access keys, and passwords in plain text. | These values can reach the model through the gateway. | Do not send credentials through the gateway until this is fixed. |
| 2 | Plumb compares only the first statement about each subject. | If a document states 30-day retention and later 90-day retention, Plumb checks only the first. | Review documents with repeated or conflicting statements manually. |
| 3 | Receipt verification can fail for multi-file inputs. | Verification reports "extracted claims differ" even when nothing changed. | Treat this result on multi-file receipts as a known false mismatch. |
| 4 | Remote access requires HTTPS. | Over plain HTTP from another device, the gateway session is lost and receipts are not generated. | Access the server from the same machine (localhost) or through HTTPS. |
| 5 | Plumb reads a retention value of `-1` as minus one day. | Systems that use `-1` to mean "retain indefinitely" are misread. | Review retention values of `-1` manually. |
| 6 | JurisCore AI has no login. | Anyone who can reach the server can use every page and MCP tool. The unlock phrase protects the gateway only. | Run the server on a trusted, access-controlled network. |

### For administrators

- **Configuration:** Copy `.env.example` to `.env.local` and add your API key and unlock phrase. The example file includes setup instructions. Full steps: `docs/GATEWAY_SETUP.md`.
- **Provider-neutral variables:** Use `JURISCORE_LLM_API_KEY` and `JURISCORE_LLM_PROVIDER`. The legacy `ANTHROPIC_API_KEY` variable remains supported.
- **Network binding:** The server now listens on the local machine only. Run `bun run dev --host` to expose it to your network.
- **Package configuration:** The on-premises package now documents the `HOST` and `PORT` settings and how to enable the gateway.
- **Supply chain hardening:** CI actions are pinned to exact commits, the release workflow validates its input, Dependabot monitors dependencies, and a daily check blocks a removed third-party build dependency from returning.

---

## Version 2026.08.01: V1 platform

**Release date:** 1 August 2026

This release established JurisCore AI as a sovereign guardrail product with verifiable receipts. All results in this release are at **Synthetic** maturity: measured on generated test data, not on benchmarks, pilots, or production traffic. This release has no connected model, no server-side storage, no authentication, and makes no compliance claims. Policy packs guide checks; they do not certify compliance.

### Highlights

**Sovereign, on-premises deployment**
JurisCore AI deploys inside your own environment: on-premises, private cloud, or air-gapped. A hosted option, when offered, uses the same product contract. The product focuses on organizations that run their own models or must control what reaches external ones. External providers are governed, not blocked. See `docs/PRODUCT_CONTRACT.md`.

**Validation receipts**
Every Veil and Plumb check produces a JSON receipt with the module, verdict, active policy packs and versions, a SHA-256 digest of the input, finding IDs, evidence locations, and a maturity label. JurisCore AI enforces three guarantees in code:

- **No sensitive values:** Receipts never contain raw input or text excerpts.
- **No invalid receipts:** Every receipt is schema-validated before download.
- **Exact match:** The receipt on screen is identical to the file you download.

**Veil detection improvements**
- Veil now detects labeled identifiers in PDF and DOCX tables, such as patient names and dates of birth on uploaded forms.
- Veil now detects phone numbers in parenthesized format, for example `(415) 555-0199`.
- Veil protects all sensitive categories by default unless an active policy specifies otherwise. Healthcare protection is delivered through the HIPAA policy pack.
- Known limitation: Veil does not detect unlabeled personal names in free text.

**Overview and navigation**
The Overview page shows weekly activity for Veil and Plumb: checks run, verdicts, sensitive items protected, volume processed, claims checked, drift found, and undetermined results. Counts come from a local, numbers-only record of checks on your device. A labeled sample dataset populates a new install and is removed after your first real check. Legacy legal-operations screens are removed.

**MCP tools use the production engines**
- `check_prompt` runs Veil with your active policy packs and returns findings without exposing detected values or submitted text.
- `retrieve_policy` returns policy pack versions, authorities, and sources.
- `compare_claims` (new) runs the Plumb comparator.
- `evaluate_response` runs Veil on the prompt and draft, then Plumb when structured claims are provided.
- `enforce_citations` and `get_audit_entry` return a labeled "not implemented" response. `get_metrics` is retired.
- Usage telemetry is off. No usage data leaves your environment.

**Accuracy and transparency corrections**
We audited the product and removed claims it could not support, including a "tamper-proof log", an unlabeled accuracy figure, unlabeled weekly totals, mock MCP responses, and a reference to a CLI product that does not exist. Every remaining metric carries a maturity label. We treat an unlabeled metric as a defect.

### Also in this release
- Cross-platform install with automatic recovery from Windows antivirus file locks (`bun run setup`).
- Automated check suite that must pass before every build ships (`bun run check:core`).
- Product website and specification for the downloadable on-premises package.

---

## Roadmap

*Last updated 30 September 2026. Roadmap items are planned, not available, and may change.*

1. **Gateway API:** A versioned API so applications can call Veil and Plumb directly.
2. **Additional model providers:** OpenAI, Azure OpenAI, Google, and others.
3. **Server-side receipts:** Central storage with retention controls, search, and shared metrics.
4. **Authentication and multi-tenancy:** Login, roles, and tenant isolation for shared deployments.
5. **Semantic validation:** Checking whether a model response agrees with the policy it cites.
6. **Expanded secret detection:** Generic `api_key=` values, AWS secret keys, and passwords in text.
7. **Remote gateway access over HTTPS:** Including deployment behind a TLS proxy.

Independent privacy, security, and detection benchmarking is planned. Until it is complete and reproducible, all JurisCore AI metrics remain labeled with their maturity level.

---

Source code, issues, and full commit history: [github.com/AnaghaP09/juriscore-ai](https://github.com/AnaghaP09/juriscore-ai)
© 2026 JurisCore. All rights reserved.
