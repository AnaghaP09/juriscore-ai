/**
 * Per-model request parameters for the gateway (PLAN-2 P2-004).
 *
 * A model the gateway may call must have a row here: the server refuses to start the
 * gateway with an allowlisted id that is missing, and never reports "Connected" for one.
 * This module is shared by the browser (labels) and the server (parameters) and imports
 * nothing provider-specific.
 */

export type GatewayEffort = "low" | "medium" | "high";

export interface GatewayModelSpec {
  id: string;
  label: string;
  /** `null` omits the parameter entirely; Haiku 4.5 rejects adaptive thinking. */
  thinking: { type: "adaptive" } | null;
  /** `null` omits `output_config.effort`; Haiku 4.5 rejects it. */
  effort: { prediction: GatewayEffort; prompt: GatewayEffort } | null;
  /** Server-side refusal fallback. First-party API only. */
  fallbacks: "default" | null;
  betas: readonly string[];
}

export const GATEWAY_MODEL_TABLE: Readonly<Record<string, GatewayModelSpec>> = {
  "claude-opus-5": {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    thinking: { type: "adaptive" },
    effort: { prediction: "medium", prompt: "high" },
    fallbacks: "default",
    betas: ["server-side-fallback-2026-07-01"],
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    thinking: { type: "adaptive" },
    effort: { prediction: "medium", prompt: "high" },
    fallbacks: null,
    betas: [],
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    thinking: null,
    effort: null,
    fallbacks: null,
    betas: [],
  },
};

export const DEFAULT_GATEWAY_MODEL_ID = "claude-opus-5";

export function gatewayModelSpec(modelId: string): GatewayModelSpec | undefined {
  return Object.prototype.hasOwnProperty.call(GATEWAY_MODEL_TABLE, modelId)
    ? GATEWAY_MODEL_TABLE[modelId]
    : undefined;
}

export function gatewayModelLabel(modelId: string) {
  return gatewayModelSpec(modelId)?.label ?? modelId;
}
