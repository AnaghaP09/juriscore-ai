import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { retrievePolicies } from "@/lib/juriscore/mock";

export default defineTool({
  name: "retrieve_policy",
  title: "Retrieve policy clauses (RAG core)",
  description: "Look up the most relevant policy clauses for a query from the selected domain rulebook (SEC/FINRA for finance, HIPAA/CMS for healthcare).",
  inputSchema: {
    query: z.string().min(1).describe("Natural-language description of the intended AI action."),
    domain: z.enum(["finance", "healthcare"]),
    limit: z.number().int().min(1).max(10).default(3),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, domain, limit }) => {
    const policies = retrievePolicies(query, domain, limit);
    return {
      content: [{ type: "text", text: `Top ${policies.length} clauses: ${policies.map((p) => p.id).join(", ")}` }],
      structuredContent: { policies },
    };
  },
});
