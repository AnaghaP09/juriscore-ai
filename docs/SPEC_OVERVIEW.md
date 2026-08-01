# Spec: dashboard Overview rebuild

Status: ratified direction 2026-08-01 (navigation reset) + founder instructions 2026-08-01 ("Veil and Plumb metrics prominently; remove buttons that do not serve the product storyline"; amended same day: "populate major metrics — weekly amount of data cleaned, one overall and specific to Veil and Plumb"); ready for implementation. This version supersedes the earlier session-counters-only draft.
Owner: product. Implementer: software-developer agent. One page: `src/routes/dashboard.index.tsx`, plus one line in `src/routes/dashboard.tsx` and a demo-store extension.

## Problem

The Overview is still the Lovable legal-ops triage screen: it imports MATTERS, HEARINGS, LEGAL_ALERTS, and AI_REVIEW from `legal-mock.ts` and simulated `getMetrics` from `mock.ts` (`src/routes/dashboard.index.tsx:8-19`), renders six legal priority cards (`dashboard.index.tsx:120-125`), a matter-triage work area, and a simulated 30-day trend chart with no maturity label (`dashboard.index.tsx:492-515`). The dashboard layout's meta description still reads "Legal operations cockpit — matters, contracts, hearings, and AI review" (`src/routes/dashboard.tsx:39`).

## Why now

The sovereign repositioning is ratified and receipts are implemented (`docs/adr/001-receipts.md`, `src/lib/juriscore/core/receipts.ts`): the Overview can show real activity. The founder wants the page populated with major weekly metrics — one overall and one each for Veil and Plumb.

## Decision on metrics (principle 8 is absolute)

**A locally persisted metrics ledger: real per-run aggregates recorded at explicit user actions, stored in this browser's localStorage, rolled up over the trailing 7 days, labeled "Live · this device". The page ships populated by default with a simulated seed (founder decision 2026-08-01): plausible weekly numbers, present on first load, badged "Simulated" on every tile, automatically evicted by the first real check.**

Reasoning: no server telemetry exists and nothing persists across sessions today, but the engines produce real, countable outcomes and the demo store already persists policy state to localStorage (`demo-store.tsx:82-88`). Real weekly numbers on this device are honestly obtainable; fabricated weekly numbers are not. The founder wants the page populated out of the box, so the simulated seed is the default state rather than an opt-in — the labeling makes that honest, and the moment real data exists, it replaces the seed. Real data evicts demo data.

Recording rules (unchanged from the prior draft, chosen so Veil's per-keystroke recomputation at `dashboard.redaction.tsx:108-117` cannot inflate counts):

- a **check** is recorded at an explicit user action: Plumb — the "Check for contradictions" run completes; Veil — the user copies the sanitized output or downloads the receipt;
- a **receipt** is listed when downloaded (both modules).

The recorded check remains semantically identical to the commercial metering unit ("the check", `PRODUCT_CONTRACT.md` commercial model): the dashboard and the pricing meter agree by construction.

### Metric definitions (exact)

Per Veil check, from the `VeilResult` in hand: occurrences protected = sum of `finding.count` across findings; the split is attributed to the run's strategy (redacted or tokenized); input volume = `raw.length` characters (displayed as KB/MB); verdict = `rawVerdict`.
Per Plumb check, from the `PlumbResult`: assertions checked = `findings.length`; matches / drifted / cannot-determine from `counts`; verdict = `verdict`.
Overall = sums across both modules plus receipts downloaded.

"Weekly" means the trailing 7 UTC days on this device (UTC to match the repo's deterministic-date convention). Buckets are per-UTC-day; days older than 30 are pruned.

## Scope

In:

- rebuild `src/routes/dashboard.index.tsx` per the layout below;
- demo-store extension (`src/lib/juriscore/demo-store.tsx`): a persisted local metrics ledger (`juriscore.localMetrics.v1` in localStorage, loaded on mount like `activePolicyIds` at `demo-store.tsx:71-80`), `recordVeilCheck(payload)`, `recordPlumbCheck(payload)`, `recordReceipt(receipt)`, a session receipt list (cap 20, mirroring `pushRun` at `demo-store.tsx:90-92`), the simulated-seed flag, and clearing of all of it in `resetDemo`;
- recording hooks: Plumb route on run completion; Veil route on copy; `ReceiptActions` gains optional `onDownloaded(receipt)` used by both routes;
- the simulated seed, present by default on first load, flagged `simulated: true` in the ledger. Seed values (fixed, so engineering does not invent numbers; internally consistent): Veil — 126 checks, 1,482 occurrences protected (1,178 redacted / 304 tokenized), 3.6 MB processed; Plumb — 88 checks, 412 assertions checked (354 matches / 37 drifted / 21 cannot determine); Overall — 214 checks (allow 132 / revise 51 / block 31), 47 receipts. While seeded, every tile carries its own "Simulated" badge and the panel caption reads "Simulated demonstration data — not measurements"; the first real recorded check deletes the entire seed and the panel switches to live counts only; Reset demo restores the seeded default state;
- replace the layout meta at `src/routes/dashboard.tsx:39` and the Overview meta at `dashboard.index.tsx:44`.

Out:

- server-side or cross-device metrics (the roadmap's receipt-backed weekly metrics item in `FEATURE_INVENTORY.md` remains the production answer);
- any engine or receipts-module change;
- charts; tiles and counts only this slice (a trend chart returns when there is real trend data to draw);
- the nav group changes (separate slice) and the legal-ops deletion (follow-on commit, see Risks).

## Button-by-button verdict on the current page

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
   Caption: "Counts from checks run on this device in the last 7 days. Cleared by Reset demo." Empty state (all totals zero, no seed): "No checks recorded on this device yet" + "Run one" links to both workbenches + the "Populate simulated demo metrics" ghost-button.
3. **Policy posture card.** Real store state only: count of active policies (`activePolicyIds.length`), badges of `shortName · version` per active pack, count of custom policies. Action: "Manage policies" → `/dashboard/rulebooks`. Keeps the Policy Library first-class on the front page.
4. **Receipts card.** Receipts downloaded (session list, newest first): receipt id (mono), module, verdict badge, time. Action: "View receipts" → `/dashboard/audit`. Empty state: "Receipts appear here after you download one from a check."
There is no Demos strip (founder decision 2026-08-01: the Live Demo group is removed; the LLM Gateway is promoted to the primary navigation with a Beta badge; pipeline, analytics, use-cases, and the CISO view leave navigation with code preserved — see the `FEATURE_INVENTORY.md` addenda). The Overview links only to Veil, Plumb, the Policy Library, and Receipts.

## Contract impact

- Removes the last unlabeled metrics from the default-visible dashboard (principle 8); every number on the page is either live-labeled local measurement or a visibly simulated seed;
- no verdict, receipt, or engine behavior changes; store extension is additive;
- the weekly tiles are operational counts, not evaluation results — they must never be presented as accuracy, coverage, or compliance, and the localStorage ledger stores aggregates only (counts and character totals), never text, findings, or digests.

## Evidence and metrics

Live tiles: real local counts, label "Live · this device". Seed: label "Simulated". No target/benchmark/pilot/production figures exist and none may appear.

## Done means

- `bun run check:core` and `bun run build` pass;
- `src/routes/dashboard.index.tsx` no longer imports from `legal-mock` or `mock` (zero grep hits in the file);
- the strings "New matter", "Create contract", "Track case", and "Legal operations cockpit" appear nowhere under `src/routes/`;
- no route reference to intake, matters, contracts, hearings, or ai-review remains in `dashboard.index.tsx`;
- fresh profile: empty states render with the seed button; seeding shows "Simulated" badges on every tile; one real Veil copy evicts the seed and the Veil tile's occurrence count equals the sum of `finding.count` for that run; one Plumb run populates matches/drifted/cannot-determine matching the workbench verdict card; a receipt download increments the overall receipts count and appears in the Receipts card; Reset demo returns the page to the empty state;
- the localStorage entry contains only numeric aggregates, the seed flag, and date keys (manual inspection);
- every numeral on the page traces to the metrics ledger, the labeled seed, the session receipts list, or policy counts — nothing else renders a numeral.

## Risks and open questions

- "This device" is honest but modest: numbers vanish on another machine or after clearing site data; the caption says what they are, and the production answer stays the receipt-backed server metrics roadmap item (owner: product, with the receipt-store slice);
- Veil copy-then-download double-counts one check; accepted for V1 (indicative counts, stated caption); durable counting arrives with the receipt store (owner: product);
- seed misuse: a screenshot cropped to hide a panel-level badge could pass simulated numbers off as real, so the "Simulated" badge goes inside each tile, not only on the panel (owner: software-developer);
- the demoted Demos routes still exist at their URLs during this slice; the nav-group slice handles grouping (owner: software-developer);
- this slice is the prerequisite for the legal-ops deletion decision recorded in `FEATURE_INVENTORY.md` (2026-08-01 addendum): once this rebuild removes the Overview's `legal-mock` imports, the five legal-ops routes and `legal-mock.ts` are deleted in a follow-on commit (owner: software-developer).
