# JurisCore release notes

## 2026.08.01 — V1 platform

**Status: V1 prototype.** Every demonstrated outcome is at **Synthetic** maturity — measured on generated fixtures, not on benchmarks, pilots, or production traffic. JurisCore runs locally and makes no external network calls at evaluation time. There is no connected model, no server-side persistence, no authentication, and no compliance claim of any kind. Policy packs guide checks; they do not certify anything.

This release turns the prototype into a coherent product: it commits to sovereign, on-premises deployment, gives every check a downloadable receipt, and removes the surfaces and claims that did not survive an honest audit.

---

### Sovereign and on-premises positioning

JurisCore is now defined as a guardrail and validation layer that deploys inside your own environment — on-premises, private cloud, or air-gapped. A hosted tier is a convenience deployment of the same contract, not a different product.

The change is written into the product contract rather than only into marketing copy: the primary storyline is now organizations that run their own models, or that must control what reaches external ones. External providers are guarded, not banned — approved providers will be reachable through the gateway, behind Veil, with credentials held server-side.

Two commitments were added to the V1 boundary at the same time. JurisCore **will** run without external network calls at evaluation time. It **will not** claim network-egress enforcement, certified air-gap operation, or authenticated multi-user operation until the gateway, authentication, and receipt persistence exist. See `docs/PRODUCT_CONTRACT.md`.

### Validation receipts

Every Veil and Plumb check now produces a receipt you can download as JSON. Each receipt carries the module, the verdict, the identifiers and versions of every policy pack in force, a SHA-256 digest of the input, the finding identifiers, evidence locators, and a maturity label.

Three properties are enforced in code rather than promised:

- **No sensitive values.** Raw input exists only long enough to be digested; it is never written to the receipt. Evidence references are copied field by field, so free-text excerpts are stripped by construction. A deterministic check scans every serialized receipt for known fixture values and fails if one appears (`scripts/check-receipts.ts`).
- **No invalid receipts.** A receipt is schema-validated before it is returned, so a malformed one cannot be downloaded.
- **What you see is what you get.** The receipt shown on screen is byte-identical to the file you download.

Receipts are handed to you, not stored by us — this build persists nothing server-side. Design decisions and their trade-offs are recorded in `docs/adr/001-receipts.md`.

### Veil: detection fixes

**Labelled identifiers in PDF and DOCX tables were being missed.** Document extraction flattens a table row into a label, a column gap, and a value — `Patient Name   Maya Patel` — so the colon that labelled detectors required was never in the text. Patient names and dates of birth uploaded as PDF forms passed through unredacted, while the same content typed into the workbench was caught. Labelled detectors now accept either punctuation or a two-space column gap; a single space still does not match, so ordinary prose does not trip them.

**The phone detector could never match a parenthesised number.** Its pattern began with a word boundary, so `(415) 555-0199` was missed in every input, not only in documents.

Both fixes are covered by deterministic checks against the extracted-document shape, including an assertion that no raw value reaches a finding (`scripts/check-veil.ts`).

Known limit, stated plainly: unlabelled personal names in prose remain undetected. The engine has no person-name detector, and adding one is a product decision, not a bug fix.

**One protection posture.** The profile selector is gone; every run protects all sensitive categories. The default is now that everything sensitive is protected unless an active policy says otherwise, which is the right default for this buyer. Healthcare protection ships as engine capability plus the HIPAA policy pack rather than as a dropdown. Scoped profiles will return as policy-driven configuration.

### Overview and navigation

The dashboard was a legal-operations cockpit inherited from the original prototype: matter triage, hearings, contract queues, and buttons that did nothing. It is gone. The intake, matters, contracts, hearings, and AI-review routes were deleted outright; pipeline, analytics, use-cases, and the executive view left the navigation with their code preserved.

Primary navigation is now six surfaces: **Overview, Veil, Plumb, Policy Library, Receipts, and LLM Gateway (Beta)**, plus MCP Connect.

The Overview shows weekly activity across three tiles — overall, Veil, and Plumb — including checks run, verdict splits, sensitive occurrences protected with the redacted and tokenized split, input volume processed, assertions checked, drift found, and cannot-determine counted as its own number rather than folded into failures. Counts come from a local ledger of real checks run on your device over the trailing seven days; the ledger stores numeric aggregates only, never text, findings, or digests.

The page ships populated with a **simulated seed** so a fresh install is not an empty screen. Those numbers are demonstration data, not measurements; each tile says so on its own badge, and the first real check you run deletes the seed permanently.

### MCP tools now run the real engines

The MCP server previously described itself as governance middleware for finance and healthcare and answered from mock data. It now runs the shipped engines and tells the truth about what it cannot do.

- `check_prompt` runs the real Veil engine with your active policy packs. It returns finding identifiers, categories, severities, counts, and verdicts only — the detected values, the replacement tokens, the sanitized text, and the submitted text never cross the tool boundary, because a tool result is copied into a model context and a client transcript.
- `retrieve_policy` reads the real policy catalog and returns pack versions, authorities, and sources.
- `compare_claims` is new, and runs the Plumb comparator.
- `evaluate_response` chains Veil over the prompt, Veil over the draft, and the Plumb comparison when structured claims are supplied. Without them, the source-of-truth stage reports that it did not run, and the verdict can be no better than *revise*.

**Two tools now fail closed instead of fabricating.** `enforce_citations` needs claim extraction from prose and a clause-level policy index; `get_audit_entry` needs a server-side receipt store. Neither exists in this build, so both return a labelled *not implemented* response rather than invented citation-coverage figures or an invented chain of checks. `get_metrics` is retired entirely: the server holds no measurable state, so every number it could return would have been simulated.

Runtime usage telemetry is switched off, so no invocation record leaves your environment. A deterministic check asserts the leak boundary, the tool registry, and the fail-closed responses (`scripts/check-mcp.ts`).

The Connect page was rebuilt to match: configuration snippets are generated from the origin serving your instance rather than a hosted URL, and the tool list reflects what the server actually exposes. **There is no authentication in this build** — anyone who can reach the URL can call every live tool. The page says so plainly.

### Corrections we made to our own claims

This section exists because a buyer evaluating a guardrail product deserves to know what we found when we audited ourselves.

- **"Safe to merge — receipt saved."** The Plumb workbench said a receipt had been saved. Nothing was saved. The copy is now honest, and receipts genuinely exist.
- **"Tamper-proof log for auditors."** Removed. Nothing in this build is tamper-evident.
- **An unlabelled accuracy dial.** The executive view rendered a hard-coded 89.2% as "how often we're right", with no indication it was invented. It now carries a demo-data label, and the view has left the primary navigation.
- **Unlabelled weekly totals.** The old Overview showed hard-coded protection counts as if they were measurements. Deleted, and replaced by the labelled ledger described above.
- **Mock MCP tools presented as working.** Addressed by the rewiring above.
- **"Available as a CLI and a web app."** The site's description claimed a CLI product. None exists; the description now says what actually ships — terminal checks and a local web app.
- **Synthetic receipts and audit entries** now carry visible demo-data labels, and the receipts page no longer suggests handing a synthetic log to an auditor.

Every number that remains anywhere in the product carries a maturity label. An unlabelled metric is treated as a defect, not a polish item.

### Also in this release

- A cross-platform, self-healing install path (`bun run setup`) that recovers from antivirus file-locks on Windows.
- A deterministic check suite — shared contracts, Veil, Plumb, receipts, and MCP — run by `bun run check:core` and required to pass before a build ships.
- A static product site, and specifications for a downloadable on-premises package (`docs/SPEC_DISTRIBUTION.md`).
- Greyed-out placeholders on the Connect page for future proprietary-provider connections. They perform no connection and are labelled as roadmap.
- Earlier prototype history from the original repository was absorbed into `main` for continuity; the V1 platform tree supersedes its content.

---

## What's next — roadmap, not shipped

These are planned, in this order. Nothing here is available today.

1. **Gateway API** — a versioned endpoint so applications can call Veil and Plumb without the UI, with JurisCore in the request path rather than beside it.
2. **Approved-provider connections behind the gateway** — routing to proprietary models (Anthropic, OpenAI, Azure OpenAI, Google, and others) through Veil, with credentials held server-side and every provider a replaceable adapter.
3. **Receipt persistence** — a receipt store with retention, search, and export, which also unlocks receipt-backed metrics that survive beyond one device.
4. **Authentication, RBAC, and tenant isolation** — the prerequisites for multi-user operation, and for any claim about isolation.

Independent privacy, security, and detection benchmarking remains ahead of us. Until it is done and reproducible, our numbers stay labelled Synthetic.

---

Source, issues, and the full commit history: [github.com/AnaghaP09/juriscore-ai](https://github.com/AnaghaP09/juriscore-ai). The repository is a private product prototype; all rights reserved.
