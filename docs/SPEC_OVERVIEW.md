# Spec: dashboard Overview rebuild

Status: implemented. First built 2026-08-01 from the founder's instructions ("Veil and Plumb metrics prominently; remove buttons that do not serve the product storyline"; "populate major metrics — weekly amount of data cleaned, one overall and specific to Veil and Plumb"). Updated 2026-10-01 to describe the page as it is on `main`.
Owner: product. Code: `src/routes/dashboard.index.tsx`, `src/routes/dashboard.tsx` (navigation), `src/lib/juriscore/demo-store.tsx` and `src/lib/juriscore/metrics-ledger.ts` (the metrics ledger).

## What the page was

Before this rebuild the Overview was a legal-operations triage screen built on mock data (matters, hearings, alerts, a simulated trend chart). Those routes and their mock data were deleted after the rebuild. Nothing on the page links to them.

## Why it was rebuilt

Receipts were implemented (`docs/adr/001-receipts.md`, `src/lib/juriscore/core/receipts.ts`), so the Overview could show real activity. The founder wanted the page to show major weekly metrics: one overall and one each for Veil and Plumb.

## Decision on metrics (principle 8 is absolute)

**A locally persisted metrics ledger: real per-run aggregates recorded at explicit user actions, stored in this browser's localStorage, rolled up over the trailing 7 days, labeled "Live · this device". The page ships populated by default with a simulated seed (founder decision 2026-08-01): plausible weekly numbers, present on first load, badged "Simulated" on every tile, automatically evicted by the first real check.**

Reasoning: no server telemetry exists and nothing persists across sessions today, but the engines produce real, countable outcomes and the demo store already persists policy state to localStorage (`demo-store.tsx:82-88`). Real weekly numbers on this device are honestly obtainable; fabricated weekly numbers are not. The founder wants the page populated out of the box, so the simulated seed is the default state rather than an opt-in — the labeling makes that honest, and the moment real data exists, it replaces the seed. Real data evicts demo data.

Recording rules (chosen so Veil's per-keystroke recomputation cannot inflate counts):

- a **Veil check** is recorded once per run (same input, policies and strategy) at the first Copy, Save report or Download receipt; later actions on the same run do not count again, as long as its receipt is still in the history;
- a **Plumb check** is recorded when "Check for contradictions" completes;
- a **receipt** is counted when it is recorded in the browser receipt history: the Veil and Plumb events above, and every completed gateway run. A gateway run adds a receipt but no Veil or Plumb check;
- the built-in samples record nothing; an edited sample is a real run.

These are activity counts for this device. They are not a billing meter; the commercial model in `PRODUCT_CONTRACT.md` is a proposal.

### Metric definitions (exact)

Per Veil check, from the `VeilResult` in hand: occurrences protected = sum of `finding.count` across findings; the split is attributed to the run's strategy (redacted or tokenized); input volume = `raw.length` characters (displayed as KB/MB); verdict = `rawVerdict`.
Per Plumb check, from the `PlumbResult`: assertions checked = `findings.length`; matches / drifted / cannot-determine from `counts`; verdict = `verdict`.
Overall = sums across both modules plus receipts recorded.

"Weekly" means the trailing 7 UTC days on this device (UTC to match the repo's deterministic-date convention). Buckets are per-UTC-day; days older than 30 are pruned.

## Scope

In:

- rebuild `src/routes/dashboard.index.tsx` per the layout below;
- demo-store extension (`src/lib/juriscore/demo-store.tsx`): a persisted local metrics ledger (`juriscore.localMetrics.v1` in localStorage, loaded on mount like `activePolicyIds` at `demo-store.tsx:71-80`), `recordVeilCheck(payload)`, `recordPlumbCheck(payload)`, `recordReceipt(receipt)`, the latest five receipts read from the browser receipt history (IndexedDB, newest 200 kept; see `SPEC_RECEIPTS.md`) and refreshed live across tabs, the simulated-seed flag, and clearing of the ledger in `resetDemo` (the receipt history is cleared from the Receipts page, not by reset);
- recording hooks: Plumb route on run completion; Veil route on the first Copy, Save report or Download receipt of a run; gateway route on every completed run (receipt only);
- the simulated seed, present by default on first load, flagged `simulated: true` in the ledger. Seed values (fixed, so engineering does not invent numbers; internally consistent): Veil — 126 checks, 1,482 occurrences protected (1,178 redacted / 304 tokenized), 3.6 MB processed; Plumb — 88 checks, 412 assertions checked (354 matches / 37 drifted / 21 cannot determine); Overall — 214 checks (allow 132 / revise 51 / block 31), 47 receipts. While seeded, every tile carries its own "Simulated" badge and the panel caption reads "Simulated demonstration data — not measurements"; the first real recorded check deletes the entire seed and the panel switches to live counts only;
- replace the layout meta at `src/routes/dashboard.tsx:39` and the Overview meta at `dashboard.index.tsx:44`.

Out:

- server-side or cross-device metrics (the roadmap's receipt-backed weekly metrics item in `FEATURE_INVENTORY.md` remains the production answer);
- any engine or receipts-module change;
- trend charts of the counts (the prediction panels carry a small sparkline of recent scores; the counts have none);
- navigation changes (done separately) and the legal-ops deletion (done in a follow-on commit).

## Button-by-button verdict on the old page (2026-08-01, all applied)

| Element (location) | Verdict | Rationale |
| --- | --- | --- |
| "New matter" button (`dashboard.index.tsx:87`, again at `:484`) | Remove | Legal-ops; no-op |
| "Upload document" button (`:88`, `:485`) | Replace | Upload belongs to Veil; becomes "Protect a document" → `/dashboard/redaction` |
| Matter/client/contract search input (`:96-102`) | Remove | Searches mock legal records only |
| "Review AI queue" chip → `/dashboard/audit` (`:105-107`) | Replace | Target survives as the Receipts surface; relabel "View receipts" |
| "Create contract" chip (`:108-110`) | Remove | Legal-ops; no-op |
| "Track case" chip (`:111-113`) | Remove | Legal-ops; no-op |
| Six priority cards on legal-mock counts (`:120-125`) | Remove | Unlabeled synthetic counts, legal-ops story |
| `VeilWeeklyCard` hard-coded totals (`:50-54`, `:206-238`) | Replace | Superseded by the real weekly panel; its "Open Veil" link survives in the header |
| Triage queue + matter panel + "Take next step" / "Open documents" no-ops (`:134-362`) | Remove | The legal-ops core of the old page |
| "Audit trail" link inside matter panel (`:355-357`) | Remove | Superseded by the Receipts card |
| AI recommendations / This week / Alerts cards (`:381-473`) | Remove | All legal-mock |
| "See full analytics" + unlabeled `MiniTrend` chart (`:188-199`, `:492-515`) | Remove | Analytics is demoted to Demos; an unlabeled simulated chart cannot headline |
| Layout meta "Legal operations cockpit…" (`dashboard.tsx:39`) | Replace | First line a buyer reads. New text: "Policy-checked AI input and output with receipts — Veil, Plumb, and the Policy Library." |

Nothing on the rebuilt page may link to intake, matters, contracts, hearings, or ai-review.

## Replacement layout (top to bottom)

1. **Header.** Eyebrow "JurisCore"; title "Protect the prompt. Prove the answer."; subline "Every check returns allow, revise, or block — with findings, policy versions, and a receipt." Actions: "Open Veil" → `/dashboard/redaction`, "Open Plumb" → `/dashboard/drift`. Existing `PageHeader` convention.
2. **Weekly metrics panel (the prominent metrics).** Badge: "Last 7 days · this device · live" (or "Simulated" while seeded). Three tiles in one row:
   - **Overall:** checks run; verdict split (allow / revise / block); receipts downloaded.
   - **Veil:** documents and prompts protected (check count); sensitive occurrences protected, with the redacted vs. tokenized split; input volume processed (KB/MB) — the founder's "amount of data cleaned up".
   - **Plumb:** checks run; assertions checked; drifted found; cannot-determine shown as its own number, never folded into failures.
   Caption: "Counts from checks run on this device in the last 7 days." Empty state (no seed, no checks in the window): "No checks recorded on this device yet" + "Run one" links to both workbenches + the "Populate simulated demo metrics" ghost-button.
   Inside the Veil and Plumb tiles sit two advisory panels, **Residual exposure** (Veil) and **Drift risk** (Plumb). Each shows the latest score and band, the bands over recent runs, and a small sparkline. The scores come from hand-set placeholder weights (`src/lib/juriscore/predict/*`, `placeholder: true`, target maturity); no measured accuracy exists and the panels say so. They are hidden while the seed is shown.
3. **Policy posture card.** Real store state only: count of active policies (`activePolicyIds.length`), badges of `shortName · version` per active pack, count of custom policies. Action: "Manage policies" → `/dashboard/rulebooks`. Keeps the Policy Library first-class on the front page.
4. **Receipts card.** The latest five receipts from the browser receipt history, newest first: receipt id (mono), module, verdict badge, time. Action: "View receipts" → `/dashboard/audit`. Empty state: "Receipts appear here after a check records one." Receipts survive reloads (newest 200 kept) and are cleared from the Receipts page.
Navigation has six entries: Overview, Veil · Privacy, Plumb · Drift, Policy Library, Receipts and LLM Gateway (`src/routes/dashboard.tsx`). There is no Demos group and no Beta badge; the pipeline, analytics, use-cases and CISO routes still exist at their URLs but are not linked. The Overview links only to Veil, Plumb, the Policy Library, and Receipts.

## Contract impact

- Removes the last unlabeled metrics from the default-visible dashboard (principle 8); every number on the page is either live-labeled local measurement or a visibly simulated seed;
- no verdict, receipt, or engine behavior changes; store extension is additive;
- the weekly tiles are operational counts, not evaluation results — they must never be presented as accuracy, coverage, or compliance. The localStorage ledger stores aggregates (counts and character totals) and prediction records (time, kind, score, band and the ids of the residual rules that fired), never input text, findings, or digests.

## Evidence and metrics

Live tiles: real local counts, label "Live · this device". Seed: label "Simulated". The prediction panels show advisory scores from placeholder weights at target maturity and are labelled as such. No benchmark, pilot or production figures exist and none may appear.

## Done means

- `bun run check:core` and `bun run build` pass;
- `src/routes/dashboard.index.tsx` no longer imports from `legal-mock` or `mock` (zero grep hits in the file);
- the strings "New matter", "Create contract", "Track case", and "Legal operations cockpit" appear nowhere under `src/routes/`;
- no route reference to intake, matters, contracts, hearings, or ai-review remains in `dashboard.index.tsx`;
- fresh profile: the seed is shown with a "Simulated" badge on every tile, and the prediction panels and recent-run history stay hidden while seeded; with no seed and no checks in the window the empty state renders with the seed button; one real Veil copy evicts the seed and the Veil tile's occurrence count equals the sum of `finding.count` for that run; one Plumb run populates matches/drifted/cannot-determine matching the workbench verdict card; a receipt download increments the overall receipts count and appears in the Receipts card;
- the localStorage entry contains numeric aggregates, the seed flag, date keys and prediction records, and no text (manual inspection);
- every numeral on the page traces to the metrics ledger, the labeled seed, the session receipts list, or policy counts — nothing else renders a numeral.

## Risks and open questions

- "This device" is honest but modest: numbers vanish on another machine or after clearing site data; the caption says what they are, and the production answer stays the receipt-backed server metrics roadmap item (owner: product, with the receipt-store slice);
- Veil Copy, Save report and Download on the same run count once (receipt reuse, `SPEC_RECEIPTS.md`); a new receipt and a new count start once that receipt has left the history through retention or a clear;
- seed misuse: a screenshot cropped to hide a panel-level badge could pass simulated numbers off as real, so the "Simulated" badge goes inside each tile, not only on the panel (owner: software-developer);
- the unlinked routes (pipeline, analytics, use-cases, CISO) still exist at their URLs;
- the five legal-ops routes and `legal-mock.ts` were deleted in the follow-on commit, as decided in `FEATURE_INVENTORY.md` (2026-08-01 addendum).
