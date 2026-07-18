import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { enforceCitations } from "@/lib/juriscore/mock";

export default defineTool({
  name: "enforce_citations",
  title: "Enforce citations (output guardrail)",
  description: "Verify that every regulatory claim in a draft response is grounded in an approved policy clause. Returns uncited/hallucinated claims.",
  inputSchema: {
    response: z.string().min(1).describe("Draft model response to inspect."),
    allowedPolicyIds: z.array(z.string()).describe("Policy clause IDs the response is permitted to cite."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ response, allowedPolicyIds }) => {
    const result = enforceCitations(response, allowedPolicyIds);
    return {
      content: [{ type: "text", text: `Verdict: ${result.verdict}. Coverage: ${(result.coverage * 100).toFixed(0)}%. Uncited claims: ${result.uncitedClaims.length}.` }],
      structuredContent: result,
    };
  },
});
