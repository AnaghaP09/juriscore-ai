import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { scanPrompt } from "@/lib/juriscore/mock";

export default defineTool({
  name: "check_prompt",
  title: "Check prompt (input guardrail)",
  description: "Scan a prompt for PII/PHI, prompt-injection, and restricted concepts before it reaches the model. Returns allow/block plus findings.",
  inputSchema: {
    prompt: z.string().min(1).describe("The user prompt to inspect."),
    domain: z.enum(["finance", "healthcare"]).describe("Which regulatory domain applies."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ prompt, domain }) => {
    const result = scanPrompt(prompt, domain);
    return {
      content: [{ type: "text", text: `Verdict: ${result.verdict}. Findings: ${result.findings.map((f) => f.type).join(", ") || "none"}.` }],
      structuredContent: result,
    };
  },
});
