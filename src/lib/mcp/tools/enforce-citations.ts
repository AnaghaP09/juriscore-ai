import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { unavailableResult } from "@/lib/mcp/safe-output";

/**
 * Citation enforcement needs two things JurisCore does not have yet: extraction of
 * claims from prose, and a clause-level index of the policy packs. Plumb compares
 * structured claims, so it cannot stand in without inventing the extraction step.
 * The tool therefore fails closed instead of returning a coverage number nobody
 * measured.
 */
export default defineTool({
  name: "enforce_citations",
  title: "Enforce citations (not implemented)",
  description:
    "NOT IMPLEMENTED in this build. Verifying that claims in prose are grounded in a cited policy clause requires claim extraction from free text and a clause-level policy index; JurisCore has neither, and returning a coverage figure without them would be fabricated. The call fails closed. Use `compare_claims` to validate structured assertions against authoritative values, or `check_prompt` to protect the draft before it is delivered.",
  inputSchema: {
    response: z
      .string()
      .min(1)
      .describe("Draft response. Not inspected — the capability is unavailable."),
    allowedPolicyIds: z
      .array(z.string())
      .describe("Policy ids the response may cite. Not inspected — the capability is unavailable."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () =>
    unavailableResult({
      capability: "Citation enforcement over free text",
      reason:
        "It requires claim extraction from prose and a clause-level policy index, neither of which exists in this build.",
      roadmapItem: "output-side model validation",
      alternative: "compare_claims",
    }),
});
