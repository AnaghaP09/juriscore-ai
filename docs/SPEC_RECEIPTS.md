# Spec: validation receipts for Veil and Plumb

Status: ratified 2026-08-01; ready for implementation.
Owner: product. Implementer: engineering. Do not start other slices before this one; it closes the largest contract gap in the demo path.

## Problem

Every check must return "an audit receipt" (`PRODUCT_CONTRACT.md`, product promise), and principle 4 requires policy versions in every receipt. The receipt schema exists (`src/lib/juriscore/core/contracts.ts:101-113`, `validationReceiptSchema`) but no code constructs a receipt. Worse, the Plumb workbench displays "Safe to merge — receipt saved" (`src/routes/dashboard.drift.tsx:471`) when nothing is saved; that is simulated evidence reading as real, the product's named worst failure mode. A sovereign-AI buyer evaluates the receipt first.

## Why now

The 2026-08-01 repositioning makes receipts the centerpiece of both demo flows, and `VALIDATION_REPORT.md` already recommends deterministic receipts as the next build slice. This slice makes both workbench demos contract-complete without any server work.

## Scope

In:

- `createReceipt()` in `src/lib/juriscore/core/receipts.ts`, validated against `validationReceiptSchema`;
- a "Download receipt" action on the Veil workbench (`src/routes/dashboard.redaction.tsx`) and on the Plumb verdict card (`src/routes/dashboard.drift.tsx`);
- a small visible receipt summary beside the action: receipt id, verdict, active policy identifiers and versions, and a "Synthetic" maturity badge;
- three pre-demo defect fixes listed below;
- deterministic checks covering the receipt behavior.

Out:

- server-side or persisted receipt storage; receipts are generated in the browser and downloaded by the user;
- the receipt-store and retention features (Team tier, later slice);
- any schema change to `validationReceiptSchema`;
- signing or tamper-evidence; no copy may claim "tamper-proof";
- gateway API, authentication, and MCP rewiring (separate slices).

## User-visible behavior

- After a Veil protection run or a Plumb comparison run, a "Download receipt" button is enabled; clicking it downloads a JSON file named `juriscore-<module>-receipt-<createdAt>.json`;
- with no run or empty input, the button is disabled;
- the receipt summary always shows the maturity label "Synthetic"; no receipt may render without a maturity label;
- a Plumb "cannot determine" result still produces a receipt: verdict `revise`, findings carrying `cannot_determine` status ids; cannot-determine is a valid, receipted outcome, not an error;
- if receipt construction fails schema validation, the UI shows a plain error ("A valid receipt could not be produced for this run") and offers no download; it must never download an invalid or partial receipt.

### Receipt contents

- `id`: `receipt.<module>.<createdAt>.<first 8 hex of inputDigest>`;
- `module`: `veil` or `plumb`;
- `policyVersion`: the active policy packs as a semicolon-joined canonical string of `id@version` (for example `pii-baseline@JurisCore 2026.07; soc2-tsc@2017 TSC with March 2020 updates`); when no policy is active, the literal `none`;
- `inputDigest`: SHA-256 hex of the raw input text via Web Crypto (`crypto.subtle.digest`); `createReceipt()` is therefore async;
- `verdict`: for Veil, the raw-input verdict (the decision about the submitted context; the sanitized verdict is recomputable from the same run); for Plumb, `result.verdict`;
- `findingIds`: the finding ids from the run; never the findings' contents;
- `evidence`: for Plumb, the assertion and authority references from each finding (already `EvidenceReference`-shaped); for Veil, an empty array in this slice;
- `maturity`: `synthetic`;
- `createdAt`: ISO datetime.

The serialized receipt must never contain raw detected values or raw input text; digest and ids only.

## Pre-demo defect fixes (in scope, same PR)

1. `src/routes/dashboard.drift.tsx:471`: replace "Safe to merge — receipt saved" with "No contradiction found"; the receipt claim becomes true only through the new download action;
2. `src/routes/dashboard.drift.tsx:205`: remove the artificial 1400 ms delay; the comparator is synchronous and honest speed is the better demo;
3. `src/routes/dashboard.ciso.tsx:28`: the hard-coded `precision = 0.892` dial gains a visible "Demo data · synthetic" label (the CISO view is demoted to Demos by the 2026-08-01 decision, but it must not show an unlabeled metric even there).

## Contract impact

- Implements the receipt half of the product promise and principle 4 (policy versions in every receipt) at Synthetic maturity;
- no change to `validationReceiptSchema`; the multi-policy encoding decision is recorded below;
- V1 boundary unchanged: receipts are browser-local artifacts, not production audit records, and no copy may say otherwise.

## Evidence and metrics

No new metrics. All receipts carry maturity `synthetic`. Nothing in this slice may be labeled benchmark, pilot, or production.

## Done means

- `bun run check:core` passes, extended with receipt assertions (either in `scripts/check-core-contracts.ts` or a new `scripts/check-receipts.ts` wired into `check:core`):
  - a Veil run and a Plumb run each produce output that parses with `validationReceiptSchema`;
  - the same input produces the same `inputDigest`;
  - the serialized receipt contains no raw fixture value (reuse the sensitive fixtures from `scripts/check-veil.ts`);
  - `policyVersion` reflects the supplied active packs and is `none` when empty;
- `bun run build` passes;
- the drift view no longer contains the string "receipt saved";
- the CISO dial renders with its maturity label.

## Risks and open questions

- `policyVersion` is a single string while multiple packs can be active; the joined canonical string is the decided V1 encoding; promoting it to a structured array is deferred to the receipt-store slice (owner: product, decide with that slice's spec);
- `crypto.subtle` requires a secure context; localhost qualifies, but the production container must serve over a secure origin or the receipt action must degrade with a plain error (owner: engineering, verify in the container slice);
- browser download UX varies; no fallback clipboard copy in this slice (accepted).
