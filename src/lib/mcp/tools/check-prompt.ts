import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { protectText } from "@/lib/juriscore/veil/engine";
import { veilScopesForPolicies } from "@/lib/juriscore/policies/catalog";
import { resolvePolicies, summarizeVeilFindings, toSafeVeilFindings } from "@/lib/mcp/safe-output";

export interface CheckPromptArgs {
  prompt: string;
  policyIds?: string[];
}

/**
 * Runs the real Veil engine over the submitted text. Every JurisCore surface uses
 * the all-sensitive profile, so the default posture is that everything sensitive
 * is protected unless an active pack narrows it.
 */
export function runCheckPrompt({ prompt, policyIds }: CheckPromptArgs) {
  const policies = resolvePolicies(policyIds);
  const result = protectText(prompt, {
    profile: "all_sensitive",
    strategy: "redact",
    policyIds: policies.policyIds,
    policyScopes: veilScopesForPolicies(policies.policyIds),
  });

  return {
    verdict: result.rawVerdict,
    sanitizedVerdict: result.sanitizedVerdict,
    requiresReview: result.requiresReview,
    profile: result.profile,
    findings: toSafeVeilFindings(result.findings),
    ...summarizeVeilFindings(result.findings),
    policyIds: policies.policyIds,
    policyVersions: policies.policyVersions,
    unknownPolicyIds: policies.unknownPolicyIds,
    sanitizedTextReturned: false,
    note: "Findings carry category, severity, and count only. Detected values and the submitted text are never returned by this tool; use the Veil workbench in JurisCore to obtain redacted or tokenized text.",
  };
}

export default defineTool({
  name: "check_prompt",
  title: "Check prompt (Veil input protection)",
  description:
    "Run JurisCore Veil over text before it reaches a model. Detects personal identifiers, customer and tenant identifiers, credentials and secrets, regulated health identifiers, and prompt-attack patterns, then returns allow, revise, or block together with the active policy versions. Findings report category, severity, and count only — the detected values and the submitted text never cross this boundary, so the result is safe to keep in a transcript. Evaluation is local and deterministic; nothing is sent anywhere.",
  inputSchema: {
    prompt: z.string().min(1).describe("The text to inspect before it reaches a model."),
    policyIds: z
      .array(z.string())
      .optional()
      .describe(
        "Policy pack ids to activate. Defaults to the built-in active set. Call `retrieve_policy` for the catalog.",
      ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ prompt, policyIds }) => {
    const result = runCheckPrompt({ prompt, policyIds });
    return {
      content: [
        {
          type: "text",
          text: `Verdict: ${result.verdict}. ${result.findingCount} finding(s) covering ${result.protectedValueCount} protected value(s); categories: ${result.categories.join(", ") || "none"}. Active packs: ${result.policyIds.join(", ") || "none"}.`,
        },
      ],
      structuredContent: result,
    };
  },
});
