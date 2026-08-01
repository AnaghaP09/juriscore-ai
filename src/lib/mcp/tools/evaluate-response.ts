import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { ValidatorVerdict } from "@/lib/juriscore/core/contracts";
import type { PlumbClaim } from "@/lib/juriscore/plumb/engine";
import { runCheckPrompt } from "@/lib/mcp/tools/check-prompt";
import { claimSchema, runCompareClaims } from "@/lib/mcp/tools/compare-claims";

const RANK: Record<ValidatorVerdict, number> = { allow: 0, revise: 1, block: 2 };

function worst(verdicts: ValidatorVerdict[]): ValidatorVerdict {
  return verdicts.reduce<ValidatorVerdict>(
    (current, verdict) => (RANK[verdict] > RANK[current] ? verdict : current),
    "allow",
  );
}

export interface EvaluateResponseArgs {
  prompt: string;
  draftResponse: string;
  policyIds?: string[];
  authorities?: PlumbClaim[];
  assertions?: PlumbClaim[];
}

/**
 * The end-to-end run over the real engines: Veil on the way in, Veil on the way
 * out, and the Plumb comparison when structured claims are supplied. When they are
 * not, the source-of-truth stage reports that it did not run — it never reports a
 * pass it did not earn.
 */
export function runEvaluateResponse({
  prompt,
  draftResponse,
  policyIds,
  authorities,
  assertions,
}: EvaluateResponseArgs) {
  const input = runCheckPrompt({ prompt, policyIds });

  if (input.verdict === "block") {
    return {
      verdict: "block" as ValidatorVerdict,
      stoppedAt: "veil_input" as const,
      input,
      output: null,
      sourceOfTruth: { evaluated: false, reason: "The run stopped at Veil input protection." },
      policyIds: input.policyIds,
      policyVersions: input.policyVersions,
      receiptPersisted: false,
    };
  }

  const output = runCheckPrompt({ prompt: draftResponse, policyIds });
  const hasClaims = Boolean(assertions && assertions.length > 0);
  const truth = hasClaims
    ? {
        evaluated: true,
        ...runCompareClaims({
          authorities: authorities ?? [],
          assertions: assertions ?? [],
          policyIds,
        }),
      }
    : {
        evaluated: false,
        reason:
          "No structured assertions were supplied, so JurisCore cannot determine whether this draft agrees with the source of truth. Supply `authorities` and `assertions`, or call `compare_claims` separately.",
      };

  const verdict = worst([
    input.verdict,
    output.verdict,
    hasClaims && "verdict" in truth ? (truth.verdict as ValidatorVerdict) : "revise",
  ]);

  return {
    verdict,
    stoppedAt: null,
    input,
    output,
    sourceOfTruth: truth,
    policyIds: input.policyIds,
    policyVersions: input.policyVersions,
    receiptPersisted: false,
  };
}

export default defineTool({
  name: "evaluate_response",
  title: "Evaluate response (Veil in, Veil out, Plumb)",
  description:
    "Run JurisCore end to end over a prompt and a draft answer: Veil protection on the input, Veil protection on the draft, and — when structured claims are supplied — the Plumb comparison against authoritative values. Returns one allow, revise, or block verdict with the active policy versions. Without structured claims the source-of-truth stage reports that it did not run and the verdict can be no better than revise. Findings carry category, severity, and count only; neither the prompt nor the draft is echoed back. No receipt is persisted server-side in this build.",
  inputSchema: {
    prompt: z.string().min(1).describe("The prompt that produced the draft."),
    draftResponse: z
      .string()
      .min(1)
      .describe("The draft answer to inspect before it is delivered."),
    policyIds: z
      .array(z.string())
      .optional()
      .describe("Policy pack ids to activate. Defaults to the built-in active set."),
    authorities: z
      .array(claimSchema)
      .optional()
      .describe("Claims read from the implemented source of truth, for the Plumb stage."),
    assertions: z
      .array(claimSchema)
      .optional()
      .describe("Claims made by the draft, for the Plumb stage."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ prompt, draftResponse, policyIds, authorities, assertions }) => {
    const result = runEvaluateResponse({
      prompt,
      draftResponse,
      policyIds,
      authorities,
      assertions,
    });
    const truth = result.sourceOfTruth.evaluated
      ? "source of truth checked"
      : "source of truth not evaluated";
    return {
      content: [
        {
          type: "text",
          text: `Verdict: ${result.verdict}. Input findings: ${result.input.findingCount}; draft findings: ${result.output?.findingCount ?? 0}; ${truth}. Active packs: ${result.policyIds.join(", ") || "none"}.`,
        },
      ],
      structuredContent: result,
    };
  },
});
