import { tone, type StatusKind } from "./status-tone";

/**
 * Presentation helpers shared by the pages and the deterministic checks (PLAN-6). Each one
 * turns a page's state into the exact kind and text it renders, so the checks assert the
 * strings the user sees rather than a boolean next to them.
 */

// --- Veil ----------------------------------------------------------------------------------

export type VeilVerdict = "allow" | "revise" | "block";

export interface VeilStatusInput {
  raw: string;
  extracting: boolean;
  isSample: boolean;
  sanitizedVerdict: VeilVerdict;
  requiresReview: boolean;
  strategy: "redact" | "tokenize";
}

export function veilStatus(input: VeilStatusInput) {
  const showResult = !input.extracting && input.raw.trim().length > 0;
  // Green needs allow and no review; review-required is amber even when the verdict is allow.
  const resultKind: StatusKind =
    input.sanitizedVerdict === "block"
      ? "verdict:block"
      : input.sanitizedVerdict === "revise" || input.requiresReview
        ? "verdict:revise"
        : "verdict:allow";
  const kind: StatusKind = !showResult || input.isSample ? "sample:any" : resultKind;
  const statusText = !showResult
    ? input.extracting
      ? "Extracting the document; protection will run when it is ready."
      : "Upload a document or enter text to create permitted model input."
    : resultKind === "verdict:block"
      ? "Blocked: do not send"
      : resultKind === "verdict:revise"
        ? "Review required before sending"
        : `${input.strategy === "redact" ? "Redacted" : "Tokenized"} · ready to send`;
  const badgeText = !showResult
    ? "No input yet"
    : `${input.sanitizedVerdict.toUpperCase()}${
        input.requiresReview && input.sanitizedVerdict !== "block" ? " · REVIEW" : ""
      }`;
  return { showResult, kind, resultKind, statusText, badgeText, tone: tone(kind) };
}

// --- Overview ------------------------------------------------------------------------------

export function formatVolume(chars: number) {
  if (chars <= 0) return "0 KB";
  if (chars < 1024 * 1024) return `${Math.max(1, Math.round(chars / 1024))} KB`;
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
}

export interface OverviewToolInput {
  checks: number;
  chars?: number;
  bands?: { low: number; uncertain: number; high: number };
}

/** A tool shows outcomes and supporting metrics only after it has run; bands only with data. */
export function overviewTool(input: OverviewToolInput) {
  const hasRun = input.checks > 0;
  const bandsTotal = input.bands ? input.bands.low + input.bands.uncertain + input.bands.high : 0;
  return {
    showOutcomes: hasRun,
    showDetails: hasRun,
    volumeLabel: formatVolume(input.chars ?? 0),
    bands: hasRun && bandsTotal > 0 ? input.bands : undefined,
    emptyText: "No checks on this device yet. Outcomes appear after the first check.",
  };
}

// --- Gateway -------------------------------------------------------------------------------

export interface GatewayBannerInput {
  phase: "loading" | "unavailable" | "locked" | "status-unknown" | "ready";
  unavailableReason?: "disabled" | "token-missing" | "error";
  message?: string;
  configured?: boolean;
  connectionState?: "connected" | "failed" | "not_connected";
  connectionError?: string;
  /** A status load, refresh or connection check is in flight. */
  checking: boolean;
  /** After unlock: the status load is still running (true) or has failed (false). */
  recovering: boolean;
}

/** The banner above the prompt: null when connected, otherwise the state and one sentence. */
export function gatewayBanner(input: GatewayBannerInput): { kind: StatusKind; text: string } | null {
  if (input.phase === "loading") {
    return { kind: "connection:checking", text: "Loading gateway status…" };
  }
  // An active check or refresh outranks whatever came before it: a failure being retried,
  // an unavailable gateway being refreshed, or a connected model being rechecked.
  if (input.checking && input.phase !== "status-unknown") {
    return input.phase === "ready" && input.configured
      ? { kind: "connection:checking", text: "Checking the connection to the active model." }
      : { kind: "connection:checking", text: "Loading gateway status…" };
  }
  if (input.phase === "unavailable") {
    if (input.unavailableReason === "error") {
      return {
        kind: "gateway:error",
        text: `Gateway unavailable${input.message ? `: ${input.message}` : ""}. Retry from the header.`,
      };
    }
    return { kind: "gateway:unconfigured", text: "Gateway not set up. Use Set up gateway in the header." };
  }
  if (input.phase === "status-unknown") {
    return input.recovering
      ? { kind: "gateway:recovering", text: "Unlocked. Loading gateway status…" }
      : {
          kind: "gateway:status-failed",
          text: "Unlocked, but the gateway status could not be loaded. Retry from the header.",
        };
  }
  if (input.phase === "locked") {
    return { kind: "gateway:locked", text: "Gateway locked. Unlock it in the header." };
  }
  if (!input.configured) {
    return { kind: "gateway:unconfigured", text: "Gateway not set up. Use Set up gateway in the header." };
  }
  if (input.connectionState === "failed") {
    return {
      kind: "connection:failed",
      text: `Connection failed: ${input.connectionError ?? "unknown reason"}.`,
    };
  }
  if (input.connectionState === "connected") return null;
  return { kind: "connection:not_connected", text: "No model connected yet." };
}

export interface GatewayScrubInput {
  prompt: string;
  blocked: boolean;
  sanitizedVerdict: VeilVerdict;
  requiresReview: boolean;
}

/** The input-scrub card: nothing for an empty prompt; green only for allow without review. */
export function gatewayScrub(input: GatewayScrubInput) {
  const visible = input.prompt.trim().length > 0;
  const sendKind: StatusKind = input.blocked
    ? "verdict:block"
    : input.sanitizedVerdict === "allow" && !input.requiresReview
      ? "verdict:allow"
      : "verdict:revise";
  const sendText = input.blocked
    ? "Will not be sent"
    : sendKind === "verdict:allow"
      ? "Safe to send after protection"
      : "Review before sending";
  return {
    visible,
    sendKind,
    sendText,
    emptyText: "Type a prompt above. The input scrub runs locally as you type and shows its result here.",
  };
}

// --- Plumb ---------------------------------------------------------------------------------

/** A comparison is a sample when the code side or the selected document is a sample. */
export function plumbSampleMode(input: { showsSampleCode: boolean; selectedDocKind?: string }) {
  return input.showsSampleCode || input.selectedDocKind === "sample";
}
