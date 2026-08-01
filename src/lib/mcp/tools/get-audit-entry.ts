import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { unavailableResult } from "@/lib/mcp/safe-output";

/**
 * Receipts are produced by each check and handed to the operator; this build has
 * no server-side receipt store, so there is nothing to look an id up in. Returning
 * a fabricated chain of checks would be worse than returning nothing.
 */
export default defineTool({
  name: "get_audit_entry",
  title: "Get validation receipt (not implemented)",
  description:
    "NOT IMPLEMENTED in this build. JurisCore issues a validation receipt for every check, but receipts are returned to the operator and not persisted server-side, so there is no store to look an id up in. The call fails closed rather than returning a fabricated chain of checks. Receipt persistence and search ship with the Team and Enterprise receipt store.",
  inputSchema: {
    id: z.string().describe("Receipt id. Not looked up — no receipt store exists in this build."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () =>
    unavailableResult({
      capability: "Receipt lookup by id",
      reason:
        "This build persists no receipts server-side; each check returns its receipt to the caller instead.",
      roadmapItem: "shared receipt retention and search",
    }),
});
