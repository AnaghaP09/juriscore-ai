import type { VeilFinding, VeilSeverity } from "@/lib/juriscore/veil/engine";
import {
  BUILT_IN_POLICIES,
  DEFAULT_ACTIVE_POLICY_IDS,
  policyById,
} from "@/lib/juriscore/policies/catalog";

/**
 * The fields of a Veil finding that may cross the MCP tool boundary.
 *
 * The engine already keeps detected values out of a finding. This type drops two
 * more things on purpose: the replacement tokens and the sanitized text. A tool
 * result is copied into a model context and into the client's transcript, so
 * JurisCore returns decisions, categories, and counts about the submitted text —
 * never the submitted text, and never a value taken from it.
 */
export interface SafeVeilFinding {
  id: string;
  detectorId: string;
  category: string;
  label: string;
  severity: VeilSeverity;
  count: number;
}

export function toSafeVeilFindings(findings: VeilFinding[]): SafeVeilFinding[] {
  return findings.map(({ id, detectorId, category, label, severity, count }) => ({
    id,
    detectorId,
    category,
    label,
    severity,
    count,
  }));
}

export interface VeilFindingSummary {
  findingCount: number;
  protectedValueCount: number;
  highSeverityCount: number;
  categories: string[];
}

export function summarizeVeilFindings(findings: VeilFinding[]): VeilFindingSummary {
  return {
    findingCount: findings.length,
    protectedValueCount: findings.reduce((total, finding) => total + finding.count, 0),
    highSeverityCount: findings.filter((finding) => finding.severity === "high").length,
    categories: [...new Set(findings.map((finding) => finding.category))],
  };
}

export interface ResolvedPolicies {
  policyIds: string[];
  policyVersions: { id: string; version: string }[];
  unknownPolicyIds: string[];
}

/**
 * Resolves caller-supplied pack ids against the real catalog. Unknown ids are
 * reported rather than silently dropped, so a caller never believes a pack was
 * applied that JurisCore does not have.
 */
export function resolvePolicies(policyIds?: string[]): ResolvedPolicies {
  const requested = policyIds && policyIds.length > 0 ? policyIds : DEFAULT_ACTIVE_POLICY_IDS;
  const resolved = requested.map((id) => ({ id, policy: policyById(id) }));
  return {
    policyIds: resolved.filter((entry) => entry.policy).map((entry) => entry.id),
    policyVersions: resolved
      .filter((entry) => entry.policy)
      .map((entry) => ({ id: entry.id, version: entry.policy!.version })),
    unknownPolicyIds: resolved.filter((entry) => !entry.policy).map((entry) => entry.id),
  };
}

export const CATALOG_POLICY_IDS = BUILT_IN_POLICIES.map((policy) => policy.id);

/**
 * The response shape for a tool whose contract JurisCore cannot honestly satisfy
 * yet. It fails closed: `isError` is set so no agent reads the call as a pass,
 * and the payload says plainly that the capability is not implemented.
 */
export function unavailableResult(options: {
  capability: string;
  reason: string;
  roadmapItem: string;
  alternative?: string;
}) {
  const alternative = options.alternative ? ` Use \`${options.alternative}\` instead.` : "";
  return {
    content: [
      {
        type: "text" as const,
        text: `UNAVAILABLE — ${options.capability} is not implemented in this build. ${options.reason} Roadmap item: ${options.roadmapItem}.${alternative} JurisCore returns no result rather than a simulated one.`,
      },
    ],
    structuredContent: {
      status: "unavailable" as const,
      implemented: false,
      capability: options.capability,
      reason: options.reason,
      roadmapItem: options.roadmapItem,
      ...(options.alternative ? { alternative: options.alternative } : {}),
    },
    isError: true,
  };
}
