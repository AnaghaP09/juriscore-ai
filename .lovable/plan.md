
## What we're building

**JurisCore AI** as two connected surfaces in one TanStack Start app:

1. **MCP server plugin** — mounted at `/mcp`, exposing JurisCore's guardrail pipeline as tools any MCP client (ChatGPT, Claude, Cursor) can call.
2. **Governance dashboard** — a marketing-grade UI over seeded/mock data showing KPIs, use-case breakdowns, audit log, and a rulebook manager.

No real LLM calls, no auth, no database. All metrics + audit entries are deterministic mock data so the demo is instant and reproducible. A public MCP consent question will be asked at build time (required by the MCP-server flow).

---

## Pages / routes

- `/` — **Landing + product overview**: hero ("The Unified Compliance Intelligence Layer"), the 4-stage pipeline diagram (Input Guardrails → RAG Core → Output Guardrails → Audit Log), CTA to dashboard + "Connect via MCP" instructions.
- `/dashboard` — **Universal Governance Dashboard** (CISO/CCO view)
  - KPI cards: Audit prep time, Violation incident rate, Time-to-ship, Guardrail accuracy (with target vs current).
  - Charts: requests over time (allowed vs blocked), latency distribution, top blocked categories.
  - Domain split: Finance vs Healthcare (stacked bar / donut).
- `/dashboard/use-cases` — **Use case breakdown** cards from the PRD (Denial Management, Ambient Clinical Docs → Coding, plus finance equivalents): volume, block rate, top failure mode, citation coverage.
- `/dashboard/audit` — **Audit log explorer**: searchable/filterable table (domain, verdict, tool, date). Row click → drawer with full chain: Prompt → Input Guardrail → Retrieved Policy → Model Response → Citation Check → Final Verdict.
- `/dashboard/rulebooks` — **Policy/Rulebook manager**: cards per domain (SEC/FINRA, HIPAA, add-your-own), doc count, last updated, coverage %, "Upload PDF/JSON" (mock).
- `/connect` — **MCP integration guide**: copy-paste config snippets for Claude Desktop / ChatGPT / Cursor pointing to `/mcp`, list of exposed tools with descriptions.

Replace the placeholder `src/routes/index.tsx` per index-placeholder rule.

---

## MCP tools exposed (`src/lib/mcp/tools/`)

All are read-only, deterministic, backed by the same mock data the dashboard reads. Each returns structured JSON + a text summary.

- `check_prompt` — input guardrail: PII scan + unsafe-content classification for a given prompt + domain (`finance` | `healthcare`).
- `retrieve_policy` — RAG lookup against the selected domain rulebook; returns matching policy clauses with IDs.
- `enforce_citations` — given a draft response + retrieved policies, returns which claims are grounded vs hallucinated.
- `evaluate_response` — end-to-end: runs the four stages above and returns a final `allow`/`block`/`revise` verdict + audit-log entry ID.
- `get_audit_entry` — fetch a prior interaction's full chain by ID.
- `get_metrics` — return current KPI snapshot (mirrors dashboard cards).

Registered in `src/lib/mcp/index.ts` via `defineMcp`, mounted with `mcpPlugin()` in `vite.config.ts`. **Public MCP** (no auth) — the consent question will be asked before build.

---

## Mock data layer

`src/lib/juriscore/mock.ts` — deterministic seed (fixed RNG) producing:
- ~500 audit-log entries across last 30 days, mixed Finance/Healthcare, ~7% block rate.
- Domain rulebooks (SEC, FINRA, HIPAA) with a handful of realistic clause stubs.
- Precomputed KPIs derived from the same log so tools and dashboard stay consistent.

Frontend reads directly from this module (no server round-trip needed). MCP tools import the same module.

---

## Design system

Dark, "trust infrastructure" aesthetic — deep navy background, single restrained accent (electric teal for allow, coral for block), Inter for body + JetBrains Mono for policy IDs / IDs in the audit log. All colors as semantic tokens in `src/styles.css`; no hardcoded Tailwind color classes. Real `head()` metadata per route (title, description, OG).

---

## Technical notes

- Stack: TanStack Start (existing template), shadcn/ui, Recharts for charts.
- Package to add: `@lovable.dev/mcp-js` (with bunfig exclusion), `zod`, `recharts`.
- Route metadata: replace root `Lovable App` defaults; leaf routes get their own head().
- No Lovable Cloud, no auth, no DB.
- Favicon: add a simple JurisCore mark (used by Lovable's MCP connector list).

---

## Out of scope (per your answers)

- Real LLM calls / real vector DB
- Persistence / auth / user management
- Human feedback loop UI (P1 in PRD)
- HR / Legal / Supply Chain domains
