/**
 * The one mapping from a named state to a colour (PLAN-6). Owner's legend:
 * green = allow, pass, verified, safe · amber = medium risk, validate, revise ·
 * red = alerts, blocker, high risk, block · grey = disabled, unknown, not yet run.
 *
 * Green is returned only for a real positive result. Advisory low-risk estimates, samples,
 * pending checks and zero counts are never green. Every page uses this module; a check
 * fails CI if `var(--allow)` is painted anywhere else.
 */

export type Tone = "positive" | "caution" | "alert" | "neutral";

export type StatusKind =
  | "verdict:allow"
  | "verdict:revise"
  | "verdict:block"
  | "plumb:matches"
  | "plumb:drifted"
  | "plumb:cannot_determine"
  | "connection:connected"
  | "connection:failed"
  | "connection:not_connected"
  | "connection:checking"
  | "gateway:locked"
  | "gateway:unconfigured"
  | "gateway:error"
  | "gateway:recovering"
  | "gateway:status-failed"
  | "run:ok"
  | "run:blocked"
  | "run:declined"
  | "run:truncated"
  | "attempt:failed"
  | "risk:low"
  | "risk:uncertain"
  | "risk:high"
  | "risk:failed"
  | "risk:advisory"
  | "verify:match"
  | "verify:mismatch"
  | "verify:pending"
  | "rule:flagged"
  | "rule:clear"
  | "control:disabled"
  | "sample:any";

const TABLE: Record<StatusKind, Tone> = {
  "verdict:allow": "positive",
  "verdict:revise": "caution",
  "verdict:block": "alert",
  "plumb:matches": "positive",
  "plumb:drifted": "alert",
  "plumb:cannot_determine": "caution",
  "connection:connected": "positive",
  "connection:failed": "alert",
  "connection:not_connected": "neutral",
  "connection:checking": "caution",
  "gateway:locked": "neutral",
  "gateway:unconfigured": "neutral",
  "gateway:error": "alert",
  "gateway:recovering": "caution",
  "gateway:status-failed": "alert",
  "run:ok": "positive",
  "run:blocked": "alert",
  "run:declined": "caution",
  "run:truncated": "caution",
  "attempt:failed": "alert",
  // Advisory estimates never claim safety: low is neutral, not green.
  "risk:low": "neutral",
  "risk:uncertain": "caution",
  "risk:high": "alert",
  "risk:failed": "alert",
  "risk:advisory": "neutral",
  "verify:match": "positive",
  "verify:mismatch": "alert",
  "verify:pending": "neutral",
  "rule:flagged": "caution",
  "rule:clear": "neutral",
  "control:disabled": "neutral",
  "sample:any": "neutral",
};

/**
 * The tone for a state. With a `count`, a count of zero is neutral whatever the state: a
 * green "Allow 0" is not a positive result.
 */
export function tone(kind: StatusKind, count?: number): Tone {
  if (count !== undefined && count <= 0) return "neutral";
  return TABLE[kind];
}

export const STATUS_KINDS = Object.keys(TABLE) as StatusKind[];

/** Tailwind class fragments per tone, built on the semantic CSS variables. */
export const TONE_CLASS: Record<
  Tone,
  { text: string; badge: string; border: string; soft: string; dotVar: string }
> = {
  positive: {
    text: "text-[color:var(--allow)]",
    badge: "border-[color:var(--allow)]/40 text-[color:var(--allow)]",
    border: "border-[color:var(--allow)]/40",
    soft: "bg-[color:var(--allow)]/15 text-[color:var(--allow)] border-[color:var(--allow)]/30",
    dotVar: "var(--allow)",
  },
  caution: {
    text: "text-[color:var(--revise)]",
    badge: "border-[color:var(--revise)]/40 text-[color:var(--revise)]",
    border: "border-[color:var(--revise)]/40",
    soft: "bg-[color:var(--revise)]/15 text-[color:var(--revise)] border-[color:var(--revise)]/30",
    dotVar: "var(--revise)",
  },
  alert: {
    text: "text-[color:var(--block)]",
    badge: "border-[color:var(--block)]/40 text-[color:var(--block)]",
    border: "border-[color:var(--block)]/40",
    soft: "bg-[color:var(--block)]/15 text-[color:var(--block)] border-[color:var(--block)]/30",
    dotVar: "var(--block)",
  },
  neutral: {
    text: "text-muted-foreground",
    badge: "border-border text-muted-foreground",
    border: "border-border",
    soft: "bg-muted/40 text-muted-foreground border-border",
    dotVar: "var(--muted-foreground)",
  },
};

export const textTone = (kind: StatusKind, count?: number) => TONE_CLASS[tone(kind, count)].text;
export const badgeTone = (kind: StatusKind, count?: number) => TONE_CLASS[tone(kind, count)].badge;
export const borderTone = (kind: StatusKind, count?: number) =>
  TONE_CLASS[tone(kind, count)].border;
export const softTone = (kind: StatusKind, count?: number) => TONE_CLASS[tone(kind, count)].soft;
export const dotTone = (kind: StatusKind, count?: number) => TONE_CLASS[tone(kind, count)].dotVar;

/** Verdict strings from receipts and engines, mapped without a lookup table per page. */
export const verdictKind = (verdict: "allow" | "revise" | "block"): StatusKind =>
  `verdict:${verdict}`;
export const riskKind = (band: "low" | "uncertain" | "high"): StatusKind => `risk:${band}`;

// --- Zero-state selectors -----------------------------------------------------------
// Pure predicates the pages and the checks share: when there is no data, no result.

/** Overview: outcome counts for a tool are shown only when that tool has run. */
export function outcomesVisible(checks: number) {
  return checks > 0;
}

/** Veil: a result exists only for non-empty text with no extraction in flight. */
export function veilResultVisible(input: { raw: string; extracting: boolean }) {
  return !input.extracting && input.raw.trim().length > 0;
}

/** Plumb: the risk panel has something to score only with a connected change or a loaded sample. */
export function plumbRiskVisible(input: { connected: boolean; sampleLoaded: boolean }) {
  return input.connected || input.sampleLoaded;
}

/** Gateway: the input scrub shows nothing for an empty prompt. */
export function gatewayScrubVisible(prompt: string) {
  return prompt.trim().length > 0;
}
