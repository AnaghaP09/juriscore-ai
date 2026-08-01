# ADR 001: Validation receipts for Veil and Plumb

Status: accepted 2026-08-01. Implements `docs/SPEC_RECEIPTS.md` (ratified 2026-08-01).
Author: software architect. Implementer: engineering.

## Context

The product promise requires every check to return an audit receipt with active policy
versions (`docs/PRODUCT_CONTRACT.md`, principle 4). `validationReceiptSchema` exists at
`src/lib/juriscore/core/contracts.ts:101-113` but nothing constructs a receipt. The Plumb
workbench claims "Safe to merge — receipt saved" (`src/routes/dashboard.drift.tsx:471`)
while saving nothing — simulated evidence reading as real. The 2026-08-01 sovereign
repositioning makes the receipt the first artifact a buyer evaluates.

Constraints from the spec and the V1 boundary:

- no change to `validationReceiptSchema`; no persistence, signing, or server work;
- receipts are browser-generated, downloaded JSON at maturity `synthetic`;
- sensitive raw values must never appear in a serialized receipt (principle 3);
- `bun run check:core` and `bun run build` must stay green at every migration step;
- the Lovable-connected branch must keep working (no big-bang refactor).

Relevant current state, verified in source:

- `protectText()` (`src/lib/juriscore/veil/engine.ts:225`) is synchronous and pure; it
  returns `rawVerdict`, `sanitizedVerdict`, findings whose `replacements` carry tokens,
  never raw values.
- `compareClaims()` (`src/lib/juriscore/plumb/engine.ts:35`) is synchronous and pure; each
  `PlumbFinding` carries `assertion.reference` and a nullable `authority.reference`, both
  `EvidenceReference`-shaped (no `excerpt` in the workbench fixtures).
- Active policies flow through `policiesForFeature()`
  (`src/lib/juriscore/policies/catalog.ts:144`); `PolicyDefinition` has `id` and `version`.
- The check harness is `scripts/check-core.ts`, which imports `check-core-contracts.ts`,
  `check-veil.ts`, `check-plumb.ts` in order; Bun executes them with top-level await
  support.

## Decision

Build a small, feature-agnostic receipt constructor in
`src/lib/juriscore/core/receipts.ts`, with per-feature input mappers in the feature
modules (`veil/receipt.ts`, `plumb/receipt.ts`) so the dependency direction stays
feature → core, never core → feature. A single shared UI component
(`src/components/receipt-actions.tsx`) renders the summary and download action on both
workbenches. A new deterministic check, `scripts/check-receipts.ts`, is wired into
`check:core` and exercises the exact production path (engine run → mapper →
`createReceipt` → schema parse → serialized-output negative assertions).

### Shape

```
workbench route (dashboard.redaction.tsx / dashboard.drift.tsx)
  └─ builds ReceiptRunInput via feature mapper (memoized per run)
       veil/receipt.ts  : VeilResult  + raw text        → ReceiptRunInput
       plumb/receipt.ts : PlumbResult + {authorities, assertions} → ReceiptRunInput
  └─ <ReceiptActions input={...}> (src/components/receipt-actions.tsx)
       └─ core/receipts.ts createReceipt(input)
            ├─ sha256Hex(rawInput)            (Web Crypto, browser + Bun)
            ├─ encodePolicyVersion(policies)  (canonical "id@version; ..." string)
            ├─ assembles ValidationReceipt
            └─ validationReceiptSchema.parse  (invalid ⇒ throw ⇒ no download)
       └─ Blob download of the exact displayed receipt
scripts/check-receipts.ts exercises the same mapper + createReceipt path headlessly.
```

Raw input text exists only as a function argument to `createReceipt` and is consumed by
the digest; it is never assigned to the receipt object. Evidence references are copied
field-by-field (`sourceId`, `sourceVersion`, `locator`) by the Plumb mapper, so `excerpt`
— the only free-text field in `evidenceReferenceSchema` — is stripped by construction.
That is the sensitive-value boundary, and the check script asserts it from the outside.

### Contracts

New module `src/lib/juriscore/core/receipts.ts`. No change to `contracts.ts`.

```ts
import {
  validationReceiptSchema,
  type EvidenceReference,
  type ValidationModule,
  type ValidationReceipt,
  type ValidatorVerdict,
} from "./contracts";

export interface ReceiptPolicyRef {
  id: string;
  version: string;
}

export interface ReceiptRunInput {
  module: ValidationModule;
  /** Digested only; never stored on the receipt. */
  rawInput: string;
  verdict: ValidatorVerdict;
  findingIds: string[];
  /** Must be excerpt-free; the feature mappers guarantee this by construction. */
  evidence: EvidenceReference[];
  policies: ReceiptPolicyRef[];
  /** ISO datetime override for deterministic checks; defaults to new Date().toISOString(). */
  createdAt?: string;
}

/** Thrown when Web Crypto is unavailable or the assembled receipt fails schema validation. */
export class ReceiptError extends Error {}

/**
 * Canonical policy encoding: sort by id (code-point order), join "id@version" with "; ".
 * Empty input returns the literal "none". Any ";" in an id or version is replaced with
 * "," and any "@" in an id with "_" so the string stays unambiguously parseable
 * (custom policies are user-named). Recorded as a V1 limit; the receipt-store slice
 * promotes this to a structured array.
 */
export function encodePolicyVersion(policies: ReceiptPolicyRef[]): string;

/** Lowercase 64-char hex SHA-256 via globalThis.crypto.subtle; throws ReceiptError if absent. */
export async function sha256Hex(text: string): Promise<string>;

/**
 * Async solely because of crypto.subtle. Assembles:
 *   id          = `receipt.${module}.${createdAt}.${inputDigest.slice(0, 8)}`
 *   maturity    = "synthetic"
 * and returns validationReceiptSchema.parse(receipt) — an invalid receipt never escapes.
 */
export async function createReceipt(input: ReceiptRunInput): Promise<ValidationReceipt>;

/** Pretty-printed JSON (2-space indent) for the downloaded file. */
export function serializeReceipt(receipt: ValidationReceipt): string;

/**
 * `juriscore-${module}-receipt-${safeCreatedAt}.json` where safeCreatedAt =
 * createdAt.replace(/[:.]/g, "-"). ISO datetimes contain ":" which is illegal in
 * Windows filenames; the spec's literal `<createdAt>` is corrected to a
 * filesystem-safe transform. Intent (a timestamped name) is preserved.
 */
export function receiptFileName(receipt: ValidationReceipt): string;
```

New file `src/lib/juriscore/veil/receipt.ts`:

```ts
import type { VeilResult } from "./engine";
import type { ReceiptPolicyRef, ReceiptRunInput } from "../core/receipts";

/** Records the raw-input verdict (result.rawVerdict); evidence is [] this slice. */
export function veilReceiptInput(
  result: VeilResult,
  rawInput: string,
  policies: ReceiptPolicyRef[],
  createdAt?: string,
): ReceiptRunInput;
```

New file `src/lib/juriscore/plumb/receipt.ts`:

```ts
import type { PlumbClaim, PlumbResult } from "./engine";
import type { ReceiptPolicyRef, ReceiptRunInput } from "../core/receipts";

/**
 * rawInput = JSON.stringify({ authorities, assertions }) — the canonical serialization
 * of the comparison inputs, in supplied order. Evidence = for each finding, the
 * assertion reference then (when non-null) the authority reference, copied as
 * { sourceId, sourceVersion, locator } only (excerpt stripped by construction).
 * verdict = result.verdict; a cannot-determine run yields verdict "revise" and a
 * valid receipt — cannot-determine is a receipted outcome, not an error.
 */
export function plumbReceiptInput(
  result: PlumbResult,
  inputs: { authorities: PlumbClaim[]; assertions: PlumbClaim[] },
  policies: ReceiptPolicyRef[],
  createdAt?: string,
): ReceiptRunInput;
```

New file `src/components/receipt-actions.tsx` (follows the `src/components/page-header.tsx`
convention):

```ts
import type { ReceiptRunInput } from "@/lib/juriscore/core/receipts";

/**
 * Pass null when there is no completed run (empty input / not yet run) — the button
 * renders disabled. When input is non-null, an effect (with stale-run cancellation)
 * builds the receipt via createReceipt; the summary shows receipt id, verdict badge,
 * the encoded policyVersion string, and a "Synthetic" maturity badge. The download
 * button serializes exactly the displayed receipt, so the shown id always matches the
 * downloaded file. On ReceiptError the component renders the plain error
 * "A valid receipt could not be produced for this run." and no download is offered.
 * Callers must memoize `input` (useMemo keyed on the run) so the effect fires per run,
 * not per render.
 */
export function ReceiptActions({ input }: { input: ReceiptRunInput | null }): JSX.Element;
```

### Workbench integration

**Plumb (`src/routes/dashboard.drift.tsx`)** — in the same edit as the defect fixes:

1. Line 471: "Safe to merge — receipt saved" → "No contradiction found". The heading at
   line 468 already says "No contradiction"; the subline becomes the honest copy. Done
   when the string "receipt saved" is absent from the file.
2. Line 205: delete `await new Promise((r) => setTimeout(r, 1400));`. `runJudge` becomes
   synchronous; delete the `judging` state (line 190) and its three usages (button
   disabled/label at 254/262, the "Comparing…" branch at 396-400, and the `!ran && !judging`
   guard at 389). The comparator is synchronous; honest speed is the better demo.
3. Add `<ReceiptActions input={receiptInput} />` to the Verdict card, where
   `receiptInput` is `useMemo(() => ran && evaluation ? plumbReceiptInput(evaluation,
   { authorities: codeClaims(driftMode), assertions: DOCUMENT_CLAIMS[doc] },
   activePlumbPolicies.map(p => ({ id: p.id, version: p.version }))) : null, ...)`.
   The mode/doc switches already clear `evaluation` (lines 246, 342), so a stale receipt
   cannot outlive its run.

**Veil (`src/routes/dashboard.redaction.tsx`)**: `result` is recomputed live
(`useMemo` at line 108), so the "run" is continuous. `receiptInput` is
`useMemo(() => raw.trim() && !progress ? veilReceiptInput(result, raw,
activeVeilPolicies.map(p => ({ id: p.id, version: p.version }))) : null, ...)`.
Place `<ReceiptActions />` in the Protection summary card header row. The Veil summary
labels its verdict "raw input verdict" with the caption "sanitized verdict recomputable
from this run" — the receipt must not read as a verdict about the sanitized output.
Per-keystroke regeneration is acceptable: one SHA-256 of the text is milliseconds even
for large extracted documents; the effect's cancellation guard prevents stale writes.

**CISO (`src/routes/dashboard.ciso.tsx:28`)**: the hard-coded `precision = 0.892` dial
card (lines 52-58) gains a visible "Demo data · synthetic" `<Badge variant="outline">`
adjacent to the dial. No behavior change.

### Verification

New `scripts/check-receipts.ts`, imported by `scripts/check-core.ts` after
`check-plumb` (Bun handles the top-level await in the import chain). To let it reuse the
sensitive fixtures, the clinical-note fixture in `scripts/check-veil.ts:4-12` is
extracted to `scripts/fixtures/veil-fixtures.ts` exporting `SYNTHETIC_CLINICAL_NOTE` and
`SENSITIVE_FIXTURE_VALUES` (`"Maya Patel"`, `"04/12/1982"`, `"88742199"`,
`"HMO-44912003"`, `"maya.patel@example.test"`, `"415-555-0199"`); `check-veil.ts`
imports them, behavior unchanged.

Assertions in `check-receipts.ts`, all with a pinned `createdAt` so every value is
deterministic:

- **Digest anchor:** `await sha256Hex("")` equals
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (known-answer test;
  catches runtime divergence between Bun and browsers at the algorithm level).
- **Veil path:** `protectText(SYNTHETIC_CLINICAL_NOTE, { profile: "healthcare",
  strategy: "redact" })` → `veilReceiptInput` → `createReceipt` parses with
  `validationReceiptSchema`; `verdict === result.rawVerdict`; `maturity === "synthetic"`;
  `id` matches `/^receipt\.veil\.<createdAt>\.[0-9a-f]{8}$/`; two calls on the same input
  produce identical `inputDigest`.
- **Sensitive boundary:** `JSON.stringify(receipt)` contains none of
  `SENSITIVE_FIXTURE_VALUES` and does not contain the fixture text itself.
- **Policy encoding:** with `[{ id: "soc2-tsc", version: "2017 TSC with March 2020
  updates" }, { id: "pii-baseline", version: "JurisCore 2026.07" }]` supplied in that
  order, `policyVersion === "pii-baseline@JurisCore 2026.07; soc2-tsc@2017 TSC with
  March 2020 updates"` (canonical id sort); with `[]`, `policyVersion === "none"`.
- **Plumb paths:** the `check-plumb.ts`-style fixture (one match, one drift, one
  cannot-determine) → receipt parses, `verdict === "block"`, evidence locators present,
  and no evidence entry has an `excerpt` key; an assertions-only run (no authorities) →
  `verdict === "revise"` and a valid receipt (cannot-determine is receipted, not an
  error).
- **Filename:** `receiptFileName(receipt)` matches
  `/^juriscore-(veil|plumb)-receipt-[^:]+\.json$/` (no colons — Windows-safe).

Manual verification only: the browser download interaction itself, the disabled state
with empty input, and the secure-context degrade (the plain error when
`crypto.subtle` is absent). `bun run check:core` cannot drive a browser; these are
demo-rehearsal checks.

### Migration order

Each step compiles, and leaves `bun run check:core` and `bun run build` green; each is
one commit on the connected branch.

1. Add `src/lib/juriscore/core/receipts.ts` (all exports above, fully implemented). No
   consumers yet — inert, green.
2. Add `src/lib/juriscore/veil/receipt.ts` and `src/lib/juriscore/plumb/receipt.ts`
   mappers. Still unconsumed, green.
3. Extract `scripts/fixtures/veil-fixtures.ts`; point `check-veil.ts` at it (behavior
   identical). Add `scripts/check-receipts.ts`; add `import "./check-receipts";` to
   `scripts/check-core.ts`. From here the receipt path is guarded before any UI exists.
4. Add `src/components/receipt-actions.tsx`. Unimported, green.
5. Wire `dashboard.drift.tsx`: defect fixes 1 and 2 plus `<ReceiptActions />` in the
   Verdict card, one commit. Verify the "receipt saved" string is gone.
6. Wire `dashboard.redaction.tsx`: memoized `receiptInput` plus `<ReceiptActions />` in
   the Protection summary card.
7. `dashboard.ciso.tsx`: add the "Demo data · synthetic" label to the precision dial.
8. Final gate: `bun run check:core`, `bun run build`, and a grep confirming
   "receipt saved" appears nowhere under `src/`.

Rollback at any step is a single-file (or single-route) revert; steps 1-4 are purely
additive and cannot affect the running product.

### Ruling on the two PM judgment calls

**1. `policyVersion` as a semicolon-joined `id@version` string — ACCEPTED, with two
hardening requirements.** The schema field is `z.string().min(1)` and the spec forbids
schema changes this slice; the joined string satisfies principle 4 (versions in every
receipt) and is losslessly parseable back to pairs. Requirements: (a) the encoding is
canonical — entries sorted by policy id in code-point order, joined with `"; "` — so the
same active set always yields byte-identical `policyVersion` (receipts are evidence;
nondeterministic encoding of identical facts would be a defect); (b) because custom
policies are user-named, `encodePolicyVersion` replaces `";"` in either field with `","`
and `"@"` in ids with `"_"` at encode time, keeping the string unambiguous. Both limits
dissolve when the receipt-store slice promotes the field to a structured array.

**2. Veil receipt records the raw-input verdict only — ACCEPTED.** The receipt attests
the decision made about the submitted context at the trust boundary; that is the
audit-relevant fact. `protectText` is pure and deterministic, so with the input digest
and policy versions recorded, `sanitizedVerdict` is recomputable from the same run.
Recording both would need either two receipts or a schema change, both out of scope.
Two consequences bind: the Veil UI must label the value "raw input verdict" so it never
reads as a claim about the sanitized output, and the recomputability argument only holds
while the engine version is implicit — the receipt-store slice must add an engine/
detector version to the receipt (or record both verdicts) before receipts claim more
than synthetic maturity.

## Consequences

- Both workbench demos become contract-complete: run → verdict → downloadable receipt
  carrying active policy ids and versions, at honestly labeled synthetic maturity.
- The sensitive-value boundary is enforced twice: by construction (raw input only ever
  digested; evidence copied excerpt-free) and by assertion
  (`check-receipts.ts` scans the serialized receipt for fixture values).
- An invalid receipt cannot be downloaded: `createReceipt` parses before returning, and
  the UI's only serialization source is a successfully parsed receipt.
- The core stays feature-agnostic; Veil and Plumb depend on core, never the reverse.
- Known accepted limits, all deferred with owners named in the spec: single-string
  `policyVersion` (receipt-store slice), no engine version in the receipt (receipt-store
  slice), secure-context requirement for `crypto.subtle` (container slice must serve a
  secure origin or the UI degrades to the plain error), no clipboard fallback for the
  download.
- Plumb's `inputDigest` is the digest of a canonical JSON of the claim inputs; it is
  comparable only within an engine/claim-shape version. Acceptable at synthetic
  maturity; the receipt-store slice makes the versioning explicit. This is the
  assumption most likely to age badly, and it is contained to one function
  (`plumbReceiptInput`).
- Spec correction recorded: the download filename uses a filesystem-safe transform of
  `createdAt` (colons and dots replaced with hyphens) because ISO datetimes contain
  characters illegal in Windows filenames; the spec's timestamped-name intent is kept.

## Alternatives considered

- **Adapters inside `core/receipts.ts` (single file).** Rejected: it points core at
  `veil/engine.ts` and `plumb/engine.ts`, inverting the dependency direction the
  contracts-are-the-spine invariant relies on. Two ~20-line mapper files are cheaper
  than a core that knows its features.
- **Building `ReceiptRunInput` inline in each route.** Rejected: the mapping is exactly
  where the sensitive-value boundary lives (excerpt stripping, digest-only raw input);
  inlining it in UI code duplicates it and puts it outside the reach of
  `check-receipts.ts`.
- **Generate the receipt only on click (no precomputation).** Rejected: the displayed
  receipt id and the downloaded file would carry different `createdAt`/ids. For a
  product whose pitch is evidence, the shown receipt must be byte-identical to the
  downloaded one.
- **Structured array for `policyVersion` now.** Rejected: requires the schema change the
  spec forbids; the canonical string is parseable and the promotion is already owned by
  the receipt-store slice.
- **Recording both Veil verdicts (e.g. verdict = sanitizedVerdict).** Rejected: the
  sanitized verdict describes output that the user may still edit before sending; the
  raw-input verdict is the boundary decision the receipt exists to witness, and the
  other is derivable.
- **A hashing dependency (e.g. js-sha256) to avoid the secure-context constraint.**
  Rejected: adds supply chain for a primitive the platform provides in both target
  runtimes; the on-prem story punishes dependency sprawl. The degrade path (plain
  error) is spec-approved.

## Implementation checklist

- [ ] 1. `src/lib/juriscore/core/receipts.ts`: `ReceiptPolicyRef`, `ReceiptRunInput`,
      `ReceiptError`, `encodePolicyVersion`, `sha256Hex`, `createReceipt`,
      `serializeReceipt`, `receiptFileName`. `bun run check:core` + build green.
- [ ] 2. `src/lib/juriscore/veil/receipt.ts` (`veilReceiptInput`) and
      `src/lib/juriscore/plumb/receipt.ts` (`plumbReceiptInput`, excerpt-stripping).
- [ ] 3. `scripts/fixtures/veil-fixtures.ts`; refactor `scripts/check-veil.ts` to import
      it; add `scripts/check-receipts.ts` with the assertion set above; add
      `import "./check-receipts";` to `scripts/check-core.ts`.
- [ ] 4. `src/components/receipt-actions.tsx`: effect with stale-run cancellation,
      summary (id, verdict badge, policyVersion, "Synthetic" badge), Blob download,
      plain-error state.
- [ ] 5. `dashboard.drift.tsx`: remove the 1400 ms delay and `judging` state; replace
      "Safe to merge — receipt saved" with "No contradiction found"; add
      `<ReceiptActions />` with memoized `plumbReceiptInput`.
- [ ] 6. `dashboard.redaction.tsx`: memoized `veilReceiptInput` (null when empty/
      extracting); `<ReceiptActions />` in the Protection summary card; "raw input
      verdict" labeling.
- [ ] 7. `dashboard.ciso.tsx`: "Demo data · synthetic" label on the precision dial.
- [ ] 8. Final gate: `bun run check:core`, `bun run build`, grep `src/` for
      "receipt saved" (must be absent); manual demo rehearsal of both download flows.
