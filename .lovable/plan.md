# JurisCore AI + Plumb — Interactive Demo Build

Extend the existing JurisCore dashboard with five new fully-client-side interactive surfaces plus a global "Kill Switch" state. All behavior is simulated in the browser against the existing deterministic mock data — no new backend, no real LLM calls.

## New global state (client-only)

Add `src/lib/juriscore/demo-store.ts` — a tiny Zustand (or React context) store holding:
- `activeModel`: `"gemini-1.5-pro" | "claude-3.5-sonnet" | "gpt-4o"`
- `killSwitch`: boolean — when true, every simulator refuses to run and shows the lockdown overlay
- `driftMode`: `"clean" | "drift"` — toggled from the PR view
- `recentRuns`: last 20 simulated gateway runs (fed into the Audit ledger view)

Overlay component `<KillSwitchOverlay />` mounted in `__root.tsx`: when active, renders a full-viewport shielded backdrop ("Shield Active — Model Endpoints Blocked") with a dismiss/disarm button.

## 1. LLM Gateway Panel — `/dashboard/gateway`

- Model selector (dropdown with logo chips for Gemini / Claude / GPT-4o, each carrying a fake context-window + $/1K token label).
- Prompt textarea + "Send through JurisCore Layer" button.
- On submit, animate a 4-step simulated run (input scrub → model call → semantic judge → output guardrail) with a progress meter. Uses `scanPrompt` + `retrievePolicies` + `enforceCitations` from existing mock.
- Result panel (3 columns): **Tokens** (prompt/completion/total, fake calc from length), **Latency** (per-stage bar breakdown summing to a realistic 400–1200ms), **Compliance** (verdict pills + triggered rule IDs).
- Each run gets pushed to `recentRuns` and rendered in a mini timeline below.

## 2. Runtime Interception Pipeline — `/dashboard/pipeline`

- SVG-based horizontal pipeline of 6 nodes: App Request → Input Guardrail → LLM Engine → Plumb Semantic Judge → Output Guardrail + Citations → Immutable Audit Ledger.
- "Play" button walks a token through each node with staggered color transitions (idle slate → pulsing blue → green pass / red block). Uses CSS keyframes + `setInterval`.
- Scenario dropdown: "Clean run", "PII detected (block at stage 2)", "Drift detected (block at stage 4)", "Uncited claim (revise at stage 5)". Each scenario deterministically colors the pipeline.
- Side detail panel: shows the payload transformation at the currently-focused stage (before/after JSON).

## 3. Plumb Drift Workbench — `/dashboard/drift`

Split-screen review UI:
- **Left**: monospace Git diff of a simulated `payments.ts` change (`kycThreshold`, `crossBorderFeeBps`) rendered with `+` / `-` gutters and syntax color. Hard-coded 2 diffs.
- **Right**: tabbed doc explorer showing a SEC filing excerpt, a customer sales deck slide, and an internal policy PDF. Each doc has sentences with `data-claim-id`.
- **"Run Plumb Judge"** button: animates a spinner ("Asking selected model for semantic verdict…"), then in `drift` mode highlights the contradicting sentence on the right and draws an SVG bezier line from that sentence to the offending diff line on the left; badge flips to `DRIFTED`. In `clean` mode all rows go green with `NO CONTRADICTION`.
- **"Simulate New PR Review"** toggle flips `driftMode` in the store.
- Verdict card at bottom: model used, confidence %, rule ID (`SEC-206(4)-1`), suggested action (Block merge / Request author explanation).

## 4. Redaction Sandbox — `/dashboard/redaction`

- Two-pane editor. Left: editable textarea prefilled with a realistic ops chat blob containing an AWS key (`AKIA...`), a Postgres URL with password, an SSN, a credit card, and a customer email.
- Right: live sanitized view — regex-driven pass replaces matches with typed tags: `[REDACTED_AWS_KEY]`, `[REDACTED_DB_URL]`, `[REDACTED_SSN]`, `[REDACTED_PAN]`, `[REDACTED_EMAIL]`.
- Findings table below: type, count, severity, rule ID (e.g. `SEC-T42`, `AML-K3`, `HIPAA-164.514`).
- "Send raw" vs "Send sanitized" side-by-side toggle showing which payload would leave the perimeter.

## 5. CISO Governance Gateway — `/dashboard/ciso`

- 4-tile telemetry strip: **Drift Detection Precision** (radial dial targeting 85%+), **Active Document Repositories** (count with sparkline), **Outstanding Policy Mismatches** (list with severity dots), **Avg Middleware Latency** (line sparkline vs 800ms budget).
- **Universal CISO Kill Switch**: large toggle with confirm dialog. When engaged, sets `killSwitch=true`, triggers overlay, and disables all simulator buttons app-wide (Gateway, Pipeline, Drift, Redaction show a locked state).
- Recent policy-mismatch feed pulled from `AUDIT` (existing mock), filtered to `verdict !== 'allow'`.
- Model endpoint health matrix: each of the 3 models × 3 regions with status pills (Healthy / Degraded / Blocked). Kill switch flips all to Blocked.

## Extend existing Audit route

- New column: `Target LLM` (populated from `recentRuns` for new entries; existing 512 mock entries get a deterministically-assigned model based on entry id hash).
- New column: `Triggered Rule ID` (already implicit via `retrievedPolicyIds` — surface the first one).
- Detail drawer already exists — extend with a "Chain of Reasoning" section (bulleted list of stage decisions).

## Navigation & shell

Extend the dashboard sidebar in `src/routes/dashboard.tsx` with the 5 new links, grouped:
- **Live Demo**: Gateway, Pipeline, Drift, Redaction
- **Governance**: Overview, Use Cases, Audit Log, Rulebooks, CISO

Persistent top bar in the dashboard layout gains: active model chip (from store), kill-switch indicator (red when armed), "Reset demo" button.

## Design system additions (`src/styles.css`)

- New tokens: `--drift`, `--drift-glow`, `--lockdown-bg`, `--pipeline-idle`, `--pipeline-active`, `--pipeline-pass`, `--pipeline-block`.
- Utilities: `.pulse-ring` (radiating rings for active pipeline node), `.diff-add` / `.diff-del` (bg-tinted diff lines), `.lockdown-scrim` (backdrop-blur + slow shield-pulse).
- Reduced-motion variants for all new animations.
- Reuse existing dark palette; no light-mode work.

## Accessibility (carry existing standards forward)

- Every new interactive control gets a visible label; icon-only buttons get `aria-label`.
- Pipeline animation exposes state via `aria-live="polite"` announcements ("Stage 3: Semantic judge complete — drift detected").
- Kill-switch overlay traps focus and is dismissible with Escape.
- Drift SVG connector lines are decorative (`aria-hidden`); the contradiction relationship is also expressed in a text summary below the split view for screen readers.
- Redaction diff exposes findings as a real `<table>` with scoped headers.

## Out of scope

- No real LLM API calls. Model selection is cosmetic + tunes the fake latency/token math.
- No new MCP tools (existing 6 remain).
- No auth changes.
- No new backend routes or DB.

## Files touched

- New: `src/lib/juriscore/demo-store.ts`, `src/components/kill-switch-overlay.tsx`, `src/components/pipeline-graph.tsx`, `src/components/diff-view.tsx`, `src/routes/dashboard.gateway.tsx`, `src/routes/dashboard.pipeline.tsx`, `src/routes/dashboard.drift.tsx`, `src/routes/dashboard.redaction.tsx`, `src/routes/dashboard.ciso.tsx`.
- Edit: `src/routes/__root.tsx` (mount overlay), `src/routes/dashboard.tsx` (sidebar + top bar), `src/routes/dashboard.audit.tsx` (new columns), `src/styles.css` (tokens + utilities), `src/routes/index.tsx` (add CTA to Gateway demo).
