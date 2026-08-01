import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { compareClaims, type PlumbClaim, type PlumbFinding } from "@/lib/juriscore/plumb/engine";
import { resolvePolicies } from "@/lib/mcp/safe-output";

const referenceSchema = z.object({
  sourceId: z.string().min(1).describe("File, document, or system the claim comes from."),
  sourceVersion: z.string().min(1).describe("Commit, digest, or version of that source."),
  locator: z.string().min(1).describe("Line, section, or paragraph inside the source."),
});

export const claimSchema = z.object({
  id: z.string().min(1),
  subject: z
    .string()
    .min(1)
    .describe("The thing being asserted, for example 'cross_border_fee'. Matching is exact."),
  value: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().optional().describe("Units must agree, or the result is cannot_determine."),
  statement: z.string().min(1).describe("The sentence or line the claim was read from."),
  reference: referenceSchema,
});

/**
 * Findings echo ids, values, units, and source references. The free-text fields a
 * caller supplies — `statement` and any evidence excerpt — are dropped so prose is
 * not copied back into a transcript, mirroring how Plumb receipts are built.
 */
function toSafeFinding(finding: PlumbFinding) {
  const claim = (value: PlumbClaim | null) =>
    value
      ? {
          id: value.id,
          subject: value.subject,
          value: value.value,
          unit: value.unit ?? null,
          reference: {
            sourceId: value.reference.sourceId,
            sourceVersion: value.reference.sourceVersion,
            locator: value.reference.locator,
          },
        }
      : null;

  return {
    id: finding.id,
    status: finding.status,
    subject: finding.subject,
    reason: finding.reason,
    assertion: claim(finding.assertion),
    authority: claim(finding.authority),
  };
}

export interface CompareClaimsArgs {
  authorities: PlumbClaim[];
  assertions: PlumbClaim[];
  policyIds?: string[];
}

export function runCompareClaims({ authorities, assertions, policyIds }: CompareClaimsArgs) {
  const policies = resolvePolicies(policyIds);
  const result = compareClaims(authorities, assertions, { policyIds: policies.policyIds });
  return {
    verdict: result.verdict,
    counts: result.counts,
    findings: result.findings.map(toSafeFinding),
    policyIds: policies.policyIds,
    policyVersions: policies.policyVersions,
    unknownPolicyIds: policies.unknownPolicyIds,
    note: "cannot_determine is a real outcome: it means the comparison had no single authoritative value, or the units disagreed. It is not a pass.",
  };
}

export default defineTool({
  name: "compare_claims",
  title: "Compare claims (Plumb source validation)",
  description:
    "Run JurisCore Plumb: compare structured assertions taken from documentation, support content, release notes, or a model answer against structured authoritative values taken from code, configuration, schemas, or policy. Matching is by exact subject and compatible units. Each assertion returns matches, drifted, or cannot_determine with both source references, and the run returns allow, revise, or block. Supply the claims yourself — this tool compares claims, it does not extract them from prose. Evaluation is local; nothing is fetched.",
  inputSchema: {
    authorities: z.array(claimSchema).describe("Claims read from the implemented source of truth."),
    assertions: z.array(claimSchema).min(1).describe("Claims to be validated."),
    policyIds: z
      .array(z.string())
      .optional()
      .describe("Policy pack ids to record against the run. Defaults to the built-in active set."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ authorities, assertions, policyIds }) => {
    const result = runCompareClaims({ authorities, assertions, policyIds });
    return {
      content: [
        {
          type: "text",
          text: `Verdict: ${result.verdict}. Matches: ${result.counts.matches}, drifted: ${result.counts.drifted}, cannot determine: ${result.counts.cannot_determine}. Active packs: ${result.policyIds.join(", ") || "none"}.`,
        },
      ],
      structuredContent: result,
    };
  },
});
