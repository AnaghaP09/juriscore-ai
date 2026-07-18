import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { AUDIT } from "@/lib/juriscore/mock";

export default defineTool({
  name: "get_audit_entry",
  title: "Get audit entry",
  description: "Fetch the full chain-of-checks for a prior JurisCore interaction by ID.",
  inputSchema: { id: z.string().describe("Audit entry id (e.g. jc_00042).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }) => {
    const entry = AUDIT.find((a) => a.id === id);
    if (!entry) {
      return { content: [{ type: "text", text: `No audit entry with id ${id}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: `${entry.id}: ${entry.verdict} (${entry.domain}/${entry.useCase})` }],
      structuredContent: entry,
    };
  },
});
