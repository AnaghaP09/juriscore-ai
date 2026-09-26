/**
 * The typed seam between commercial tiers and predictive capabilities.
 *
 * No authentication, tenancy, or persistence exists yet, so nothing here is a paywall.
 * The tier comes from server configuration only, never from a request, and defaults to
 * Free. A capability is "available" only when the tier includes it *and* it has been
 * built; everything else is reported as roadmap so the UI can say so plainly instead of
 * rendering a button that does nothing.
 */

export const TIERS = ["free", "team", "enterprise"] as const;

export type Tier = (typeof TIERS)[number];

export const DEFAULT_TIER: Tier = "free";

export const PREDICTIVE_CAPABILITIES = [
  "local-risk-score",
  "score-history",
  "ci-gate",
  "model-backed-prediction",
  "candidate-subjects",
  "not-drift-feedback",
  "private-weight-pack",
  "self-hosted-model",
  "air-gapped-weight-updates",
] as const;

export type PredictiveCapability = (typeof PREDICTIVE_CAPABILITIES)[number];

const TEAM: readonly PredictiveCapability[] = [
  "local-risk-score",
  "score-history",
  "ci-gate",
  "model-backed-prediction",
  "candidate-subjects",
  "not-drift-feedback",
];

export const TIER_CAPABILITIES: Record<Tier, readonly PredictiveCapability[]> = {
  // The free tier runs the same weights and attribution as every paid tier.
  free: ["local-risk-score"],
  team: TEAM,
  enterprise: [...TEAM, "private-weight-pack", "self-hosted-model", "air-gapped-weight-updates"],
};

/** Capabilities that exist in this build. Everything else is roadmap. */
export const IMPLEMENTED_CAPABILITIES: readonly PredictiveCapability[] = ["local-risk-score"];

export type CapabilityState = "available" | "roadmap" | "not-in-tier";

/** Server-side configuration the tier is read from. Never populated from a request. */
export interface ServerEntitlementConfig {
  JURISCORE_TIER?: string;
}

/** Reads the tier from server configuration. Anything missing or unrecognised is Free. */
export function resolveTier(config: ServerEntitlementConfig | undefined): Tier {
  const raw = config?.JURISCORE_TIER?.trim().toLowerCase();
  return TIERS.find((tier) => tier === raw) ?? DEFAULT_TIER;
}

export function tierIncludes(tier: Tier, capability: PredictiveCapability) {
  return TIER_CAPABILITIES[tier].includes(capability);
}

export function capabilityState(tier: Tier, capability: PredictiveCapability): CapabilityState {
  if (!tierIncludes(tier, capability)) return "not-in-tier";
  return IMPLEMENTED_CAPABILITIES.includes(capability) ? "available" : "roadmap";
}
