
# Make the copy precise and human

Right now the landing page and dashboards lean on insider phrases ("compliance middleware", "RAG core", "Policy Orchestrator", "guardrail accuracy", "citation coverage"). This plan rewrites the user-facing text — no logic, no layout changes — so any reader can answer three questions in 10 seconds:

1. **What breaks today?** AI assistants make things up, leak private data, and cite rules that don't exist. Nobody can prove what the AI said or why.
2. **What does JurisCore do?** It sits between your app and the AI, checks every message going in and coming out against your real rulebook, and keeps a receipt.
3. **What do I get?** Fewer bad answers, no leaked data, and an audit you can hand to a regulator in minutes instead of days.

## Landing page (`src/routes/index.tsx`)

- **Eyebrow badge** → `Trust layer for AI in regulated work`
- **H1** → `Stop your AI from saying things it shouldn't.`
- **Sub** → `JurisCore checks every AI message — before it's sent and before it's shown — against your real policies. Bad answers get blocked, private data gets scrubbed, and every decision leaves a receipt.`
- **Stats row** — plain-English labels:
  - `Blocked bad answers` · `7 in 100`
  - `Audit report ready in` · `Minutes` (was days)
  - `Shipped in` · `6 days` (was 47)
  - `Correct calls` · `97%`
- **Four-stage section** → title `How a single question travels through JurisCore.`
  - `01 · Screen the question` — remove names, IDs, medical details; block sneaky prompts.
  - `02 · Find the rule` — pull the exact clause from your rulebook (SEC, HIPAA, etc.).
  - `03 · Check the answer` — every claim must trace back to that clause, or it gets rewritten or blocked.
  - `04 · Keep the receipt` — a tamper-proof log any auditor can read.
- **MCP section** → title `Works with the tools your team already uses.` Sub-copy in plain terms: `Plug JurisCore into ChatGPT, Claude, or Cursor. They'll ask JurisCore before answering anything sensitive.`

## Dashboard overview (`src/routes/dashboard.index.tsx`)

- Eyebrow → `What's happening`
- Title → `Governance overview`
- Description → `Last 30 days across your AI apps. Green means safe, red means we caught something.`
- KPI card renames + one-line explainers:
  - `Bad answers caught` — was "Violation rate"
  - `Correct calls` — was "Guardrail accuracy"
  - `Audit report ready in` — was "Audit prep time"
  - `Time to launch new AI feature` — was "Time to ship"
- Chart titles: `Requests per day`, `Where we stopped things`, `Finance vs. Healthcare`, `How fast we respond`
- Latency copy → `Every question goes through four checks and still comes back in under a second.`

## Sub-pages — headers and one-line descriptions only

Same PageHeader pattern, plainer words:

- **Use cases** → `AI features we're protecting` / `Each card is one AI feature in your product. Click to see how it's behaving.`
- **Use case detail** → keep name, add sub `What this AI feature does, how often it runs, and when we had to step in.`
- **Audit** → `Receipts` / `Every AI decision, searchable. Give this to your auditor.`
- **Rulebooks** → `Your rules` / `The policies JurisCore checks against. Add or edit them here.`
- **Gateway** → `Try it live` / `Send a fake question through JurisCore and watch each check happen.`
- **Pipeline** → `How it works, step by step` / `Pick a scenario and see where JurisCore steps in.`
- **Drift (Plumb)** → `Docs vs. code` / `When your code changes but the docs don't, Plumb flags the mismatch — with the exact line.`
- **Redaction** → `Private-data scrubber` / `Paste anything with a name, SSN, or API key. Watch it disappear.`
- **CISO** → `Executive view` / `The health of every AI app in one screen — plus the emergency stop.`
  - Kill-switch button label → `Emergency stop — freeze all AI`

## What is not changing

- No component structure, routing, styling, tokens, or data-model changes.
- No new files. Edits are copy-only inside existing JSX strings.
- Technical terms (`MCP`, `SEC`, `HIPAA`) stay where they're accurate — they get one-line plain-English gloss, not removal.

## Technical notes

Text-only edits in these files: `src/routes/index.tsx`, `src/routes/dashboard.index.tsx`, `src/routes/dashboard.use-cases.tsx`, `src/routes/dashboard.use-cases.$key.tsx`, `src/routes/dashboard.audit.tsx`, `src/routes/dashboard.rulebooks.tsx`, `src/routes/dashboard.gateway.tsx`, `src/routes/dashboard.pipeline.tsx`, `src/routes/dashboard.drift.tsx`, `src/routes/dashboard.redaction.tsx`, `src/routes/dashboard.ciso.tsx`. Verify with `tsgo` after.
