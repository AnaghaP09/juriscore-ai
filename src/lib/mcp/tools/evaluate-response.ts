import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { enforceCitations, retrievePolicies, scanPrompt, AUDIT } from "@/lib/juriscore/mock";

export default defineTool({
  name: "evaluate_response",
  title: "Evaluate response (end-to-end guardrail)",
  description: "Run the full JurisCore pipeline: input guardrail → policy retrieval → citation enforcement. Returns a final allow/block/revise verdict and a synthetic audit entry ID.",
  inputSchema: {
    prompt: z.string().min(1),
    draftResponse: z.string().min(1),
    domain: z.enum(["finance", "healthcare"]),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: ({ prompt, draftResponse, domain }) => {
    const input = scanPrompt(prompt, domain);
    if (input.verdict === "block") {
      return {
        content: [{ type: "text", text: `BLOCKED at input guardrail: ${input.findings.map((f) => f.type).join(", ")}` }],
        structuredContent: { verdict: "block", stage: "input_guardrail", input },
      };
    }
    const policies = retrievePolicies(prompt, domain, 3);
    const citation = enforceCitations(draftResponse, policies.map((p) => p.id));
    const finalVerdict = citation.verdict === "allow" ? "allow" : "revise";
    // Simulate audit-entry id (does not persist)
    const id = `jc_sim_${AUDIT.length + 1}`;
    return {
      content: [
        {
          type: "text",
          text: `Final verdict: ${finalVerdict}. Retrieved ${policies.length} policies. Citation coverage ${(citation.coverage * 100).toFixed(0)}%. Audit id: ${id}`,
        },
      ],
      structuredContent: {
        verdict: finalVerdict,
        auditId: id,
        input,
        retrievedPolicies: policies,
        citation,
      },
    };
  },
});
