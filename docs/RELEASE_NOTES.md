# JurisCore release notes

## 2026.09.30 — A connected model, your own sources, receipts you keep

Released as package **v2026.10.01**: [download](https://github.com/AnaghaP09/juriscore-ai/releases/tag/v2026.10.01) · [all releases](https://github.com/AnaghaP09/juriscore-ai/releases)

**Status: version 2026.10.01.** Runs on your own machine. Every number in the product is labelled. Detection quality is not yet measured on real traffic. There is no login. A single local server on port 8080 serves everything.

Since the 2026.08.01 release, JurisCore can send a prompt to a real model through its own gateway, check your own code and documents instead of sample data, and keep a history of receipts in your browser. This entry lists the changes that matter, the fixes that change a result, the things we turned off, the claims from the last notes that are no longer true, and the problems we know about today.

---

### What is new

**LLM Gateway — send a prompt to a real model, with Veil in the path.** Put your proprietary LLM API key and an unlock phrase on the server, unlock the gateway from the header, and the connection is tested for you. Every prompt goes through Veil before it leaves, the reply goes through Veil on the way back, and each completed run gets a receipt. The API key never reaches the browser. Anthropic is the only provider this build accepts. The "Beta" badge is gone.

**Guided gateway setup.** Choose **Set up gateway** in the header: the product suggests an unlock phrase and links to the steps. Setup is your API key plus that phrase in `.env.local`, copied from `.env.example`, which now carries the instructions itself. The variable names are provider-agnostic (`JURISCORE_LLM_API_KEY`, `JURISCORE_LLM_PROVIDER`); the old `ANTHROPIC_API_KEY` still works. The gateway is for the server's own machine in this build; remote use is roadmap. Steps: `docs/GATEWAY_SETUP.md`.

**Plumb reads your own sources.** Paste a diff, fetch a public GitHub pull request by number, or upload your own documents. Plumb reads every file in the diff, not only the first. Sources stay in memory and are gone when you close the page. Private repositories are not supported yet.

**Receipts you keep.** The Receipts page now shows a live history of your real checks, stored in your browser, up to 200 records. You can filter, export, delete, and verify a receipt against the same input. Nothing is stored on the server.

**Predictive scores, clearly labelled.** Veil shows a residual-exposure score and Plumb shows a drift-risk score, with a history on the Overview. These are advisory. They use hand-set weights at "target" maturity, not a trained model, and they never change a verdict.

**Policy Library — edit and delete your own policies.** Custom policies can now be changed and removed. Old receipts that name a removed policy still open.

**Veil — invoice and payment data.** New detectors for bank routing and account numbers, IBAN, SWIFT codes, tax IDs, postal addresses, and contact names. Tables in PDF and DOCX files keep their column gaps so labelled values are found.

### Fixes that change a result

- **Plumb no longer reports drift when only the format differs.** `30` and `"30"`, `true` and `"true"`, and the same value in different units now match.
- **Plumb no longer says "allow" when it compared nothing.** An empty comparison is reported as such.
- **Plumb reads every file in a change.** Earlier only the first file was read, so claims in later files were missed.
- **The gateway sends nothing when Veil blocks.** If the second Veil pass still finds sensitive data, the run stops and the model is never called.

### Turned off or removed

- **Reset demo** is gone from the dashboard.
- **MCP Connect** is greyed out and marked "Soon". The `/mcp` endpoint itself still answers, without authentication, for anyone who can reach the server.
- The **Demos** group has left the navigation. Navigation is now Overview, Veil, Plumb, Policy Library, Receipts, and LLM Gateway.

### Corrections to the 2026.08.01 notes

The last notes made three claims that are no longer true. We would rather say so here than let you find out.

- **"Nothing is persisted."** The browser now stores receipts, custom policies, and metric counts on your device. The server still stores nothing.
- **"No external network calls."** Three things call out: fetching a public GitHub pull request, reading text from images (the OCR library downloads its files from a public CDN on first use), and the gateway when you turn it on. Veil and Plumb checks themselves make no network call.
- **"A receipt for every run."** Not yet. If the model provider fails or times out after the prompt was sent, no receipt is written. If you clear a run while it is in flight, its receipt is dropped.

### Known issues

These are open today. Please read them before you rely on the product.

1. **Some secrets pass Veil and reach the model.** Veil recognises keys by known prefixes such as `sk-`. A value written as `api_key=...`, an AWS secret access key, or a password written in a sentence is not detected and will be sent through the gateway.
2. **Plumb checks only the first statement about each subject.** If a document says the retention period is 30 days and later says it is 90 days, only the first is compared.
3. **Receipt verification can fail on inputs with more than one file.** Verification rebuilds claims from the first file only, so a receipt made from a multi-file diff reports "extracted claims differ" even when nothing changed.
4. **Using the server from another device needs HTTPS.** Over plain HTTP from a different machine, the gateway session cookie is not kept and receipts cannot be generated. On the same machine over localhost everything works.
5. **A retention value of -1 is read as minus one day.** Many systems use -1 to mean "keep forever". Plumb does not.
6. **There is no login.** Anyone who can reach the address can use every page and every MCP tool. The gateway passphrase protects the gateway only.

### Also in this release

- The product no longer depends on Lovable. A daily check fails if any Lovable package or sync reappears.
- CI actions are pinned to exact commits, the release workflow validates its input, and Dependabot watches dependencies.
- The local server listens on this machine only. Use `bun run dev --host` to open it to your network on purpose.
- The on-prem package documents `HOST` and `PORT`, and how to turn on the gateway.

---

## 2026.08.01 — V1 platform

**Status: V1 platform.** Every demonstrated outcome is at **Synthetic** maturity — measured on generated fixtures, not on benchmarks, pilots, or production traffic. JurisCore runs locally and makes no external network calls at evaluation time. There is no connected model, no server-side persistence, no authentication, and no compliance claim of any kind. Policy packs guide checks; they do not certify anything.

This release turns the early build into a coherent product: it commits to sovereign, on-premises deployment, gives every check a downloadable receipt, and removes the surfaces and claims that did not survive an honest audit.

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

The dashboard was a legal-operations cockpit inherited from the original build: matter triage, hearings, contract queues, and buttons that did nothing. It is gone. The intake, matters, contracts, hearings, and AI-review routes were deleted outright; pipeline, analytics, use-cases, and the executive view left the navigation with their code preserved.

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
- Earlier history from the original repository was absorbed into `main` for continuity; the V1 platform tree supersedes its content.

---

## What's next — roadmap, not shipped

Updated 2026.09.30. Nothing here is available today.

1. **Gateway API** — a versioned endpoint so applications can call Veil and Plumb without the UI. Still ahead.
2. **More providers behind the gateway** — Anthropic is connected. OpenAI, Azure OpenAI, Google, and others are not.
3. **Receipts on the server** — receipts are kept in your browser today. A server-side store with retention, search, and shared metrics is still ahead.
4. **Login, roles, and tenant isolation** — needed before more than one person can use one server safely.
5. **Semantic judge** — checking whether a model reply agrees with the policy text it cites. The card exists on the gateway page and is labelled Roadmap.
6. **Detector gaps listed under Known issues** — generic `api_key=` values, AWS secret keys, and passwords in prose.
7. **Remote gateway use behind HTTPS** — unlocking the gateway from another device, including through a TLS proxy. Today it works from the server's own machine only.

Independent privacy, security, and detection benchmarking remains ahead of us. Until it is done and reproducible, our numbers stay labelled.

---

Source, issues, and the full commit history: [github.com/AnaghaP09/juriscore-ai](https://github.com/AnaghaP09/juriscore-ai). The repository is a private product; all rights reserved.
