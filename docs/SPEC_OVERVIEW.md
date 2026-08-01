# Spec: dashboard Overview rebuild

Status: ratified direction 2026-08-01 (navigation reset) + founder instruction 2026-08-01 ("Veil and Plumb metrics prominently; remove buttons that do not serve the product storyline"); ready for implementation.
Owner: product. Implementer: software-developer agent. One page: `src/routes/dashboard.index.tsx`, plus one line in `src/routes/dashboard.tsx` and a small demo-store extension.

## Problem

The Overview is still the Lovable legal-ops triage screen: it imports MATTERS, HEARINGS, LEGAL_ALERTS, and AI_REVIEW from `legal-mock.ts` and simulated `getMetrics` from `mock.ts` (`src/routes/dashboard.index.tsx:8-19`), renders six legal priority cards (`dashboard.index.tsx:120-125`), a matter-triage work area, and a simulated 30-day trend chart with no maturity label (`dashboard.index.tsx:492-515`). It is the first page a buyer sees, and it tells the abandoned story. The dashboard layout's own meta description still reads "Legal operations cockpit — matters, contracts, hearings, and AI review" (`src/routes/dashboard.tsx:39`).

## Why now

The sovereign repositioning is ratified and receipts are implemented (`docs/adr/001-receipts.md`, `src/lib/juriscore/core/receipts.ts`): for the first time the Overview can show real activity instead of staged activity.

## Decision on "Veil and Plumb metrics prominently" (principle 8)

**Live per-session counters fed by the demo store; zero synthetic metrics anywhere on the page.** No real telemetry exists; the honest prominent metric is what actually happened in this browser session. Weighed against the alternatives: labeled synthetic demo numbers still teach the buyer to distrust the page (and the ratified defect list is about retiring them, not relocating them); a receipts-only panel is too sparse. Real-but-small beats fake-but-big. The simulated `VEIL_WEEKLY_DEMO` block (`dashboard.index.tsx:50-54`) is deleted, not relabeled; the receipt-backed weekly metrics remain the roadmap item already recorded in `FEATURE_INVENTORY.md`.

Two recording rules, chosen so counts cannot inflate from Veil's per-keystroke recomputation (`dashboard.redaction.tsx:108-117`):

- a **check** is counted at an explicit user action: Plumb — the "Check for contradictions" run completes; Veil — the user copies the sanitized output or downloads the receipt (first explicit taking of the run's output);
- a **receipt** is listed when the user downloads one (both modules).

This makes the Overview counter semantically identical to the commercial metering unit ("the check", `PRODUCT_CONTRACT.md` commercial model) — the dashboard and the pricing meter agree by construction.

## Scope

In:

- rebuild `src/routes/dashboard.index.tsx` per the layout below;
- demo-store extension (`src/lib/juriscore/demo-store.tsx`): per-module/per-verdict session check counters + a session receipt list, both cleared by `resetDemo` (`demo-store.tsx:107-113`);
- recording hooks: Plumb route on run completion; Veil route on copy; `ReceiptActions` gains an optional `onDownloaded(receipt)` callback both routes use;
- replace the layout meta description at `src/routes/dashboard.tsx:39` and the Overview meta at `dashboard.index.tsx:44`.

Out:

- persistence of session state (in-memory only; reload clears it — the panel says so);
- any change to the engines, receipts module, or check scripts beyond a store-shape check if trivial;
- the nav group changes themselves (separate slice of the ratified decision);
- weekly/aggregate metrics of any kind.

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
| `VeilWeeklyCard` simulated totals (`:50-54`, `:206-238`) | Replace | Superseded by the live session panel; its "Open Veil" link survives in the header |
| Triage queue + matter panel + "Take next step" / "Open documents" no-ops (`:134-362`) | Remove | The legal-ops core of the old page |
| "Audit trail" link inside matter panel (`:355-357`) | Remove | Superseded by the Receipts card |
| AI recommendations / This week / Alerts cards (`:381-473`) | Remove | All legal-mock |
| "See full analytics" + unlabeled `MiniTrend` chart (`:188-199`, `:492-515`) | Remove | Analytics is demoted to Demos; an unlabeled simulated chart cannot headline |
| Layout meta "Legal operations cockpit…" (`dashboard.tsx:39`) | Replace | In scope — first line a buyer reads. New text: "Policy-checked AI input and output with receipts — Veil, Plumb, and the Policy Library." |

Nothing on the rebuilt page may link to intake, matters, contracts, hearings, or ai-review.

## Replacement layout (top to bottom)

1. **Header.** Eyebrow "JurisCore"; title "Protect the prompt. Prove the answer."; subline "Every check returns allow, revise, or block — with findings, policy versions, and a receipt." Actions: "Open Veil" → `/dashboard/redaction`, "Open Plumb" → `/dashboard/drift`. Use the existing `PageHeader` component convention.
2. **Session activity panel (the prominent metrics).** Two side-by-side module cards, Veil and Plumb. Each shows: checks this session (large number), verdict breakdown as allow/revise/block counts with the existing verdict colors, and the last check's verdict badge and time. Panel-level badge: "This session · live". Caption: "Counts from checks run in this browser session; cleared by Reset demo and page reload." Data source: new store counters (real). Empty state (per module, when its count is 0): "No {Veil|Plumb} checks yet this session" with a "Run one" link to the workbench. No number renders that did not come from a real engine run.
3. **Policy posture card.** Real store state only: count of active policies (`activePolicyIds.length`), badges of `shortName · version` for each active pack (built-in and custom via the catalog helpers), count of custom policies. Action: "Manage policies" → `/dashboard/rulebooks`. This keeps the Policy Library first-class on the front page.
4. **Receipts card.** List of receipts downloaded this session, newest first: receipt id (mono), module, verdict badge, time; each row is display-only. Action: "View receipts" → `/dashboard/audit`. Empty state: "Receipts appear here after you download one from a check." Data source: new store receipt list (real).
5. **Demos strip (last, small).** Single row: "Simulated demonstrations" label + links to the demoted surfaces (`/dashboard/gateway`, `/dashboard/pipeline`, `/dashboard/analytics`, `/dashboard/use-cases`, `/dashboard/ciso`). Every link carries the simulated framing; no numbers shown here.

Links on the page target only kept or demoted surfaces per the ratified navigation: redaction, drift, rulebooks, audit, and the five Demos routes.

## Store and wiring contract

- `demo-store.tsx`: add `sessionChecks: Record<"veil" | "plumb", { allow: number; revise: number; block: number; lastAt: string | null; lastVerdict: ValidatorVerdict | null }>` and `recordSessionCheck(module, verdict)`; add `sessionReceipts: Array<{ id: string; module: string; verdict: string; createdAt: string }>` (newest first, cap 20, mirroring `pushRun` at `demo-store.tsx:90-92`) and `recordSessionReceipt(receipt)`. `resetDemo` clears both.
- `dashboard.drift.tsx`: call `recordSessionCheck("plumb", evaluation.verdict)` where the evaluation lands in `runJudge`.
- `dashboard.redaction.tsx`: call `recordSessionCheck("veil", result.rawVerdict)` in `copySanitized`; pass `onDownloaded` to `ReceiptActions` recording both a check and the receipt (dedupe: a download that follows a copy of the same run may double-count the check — accepted for V1, session counters are indicative, and the caption says what they count).
- `src/components/receipt-actions.tsx`: optional `onDownloaded?: (receipt: ValidationReceipt) => void`, invoked after a successful download only.

## Contract impact

- Removes the last unlabeled metrics from the default-visible dashboard (principle 8);
- no verdict, receipt, or engine behavior changes; store extension is additive;
- the Overview becomes consistent with the amended contract's first paragraph and the metering definition.

## Evidence and metrics

Session counters are live operational counts, not evaluation results; they carry the "This session · live" label and are never presented as accuracy, coverage, or compliance. No target/synthetic/benchmark figures appear on the page.

## Done means

- `bun run check:core` and `bun run build` pass;
- `src/routes/dashboard.index.tsx` no longer imports from `legal-mock` or `mock` (grep both module names — zero hits in the file);
- the strings "New matter", "Create contract", "Track case", and "Legal operations cockpit" appear nowhere under `src/routes/`;
- no route reference to intake, matters, contracts, hearings, or ai-review remains in `dashboard.index.tsx`;
- with a fresh session: both module cards show their empty states; after one Plumb run and one Veil copy, the counters read 1 and 1 and match the verdicts shown in the workbenches; after a receipt download, the Receipts card lists it; Reset demo returns the page to empty states;
- every number visible on the page traces to `sessionChecks`, `sessionReceipts`, or `activePolicyIds`/`customPolicies` length — nothing else renders a numeral.

## Risks and open questions

- Veil copy-then-download double-counts one check; accepted for V1 and stated in the caption (owner: product; revisit with the receipt-store slice, which introduces durable counting);
- session state does not survive reload; if the founder wants counts to persist locally, that is a one-line localStorage decision but changes the "session" label — decide only if asked (owner: product);
- the demoted Demos routes still exist at their URLs during this slice; the nav-group slice handles their grouping (owner: software-developer, separate task from the ratified decision);
- this slice is the prerequisite for the legal-ops deletion decision recorded in `FEATURE_INVENTORY.md` (2026-08-01 addendum): once this rebuild removes the Overview's `legal-mock` imports, the five legal-ops routes and `legal-mock.ts` are deleted in a follow-on commit (owner: software-developer).
