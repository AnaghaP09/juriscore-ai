import { defineTool } from "@lovable.dev/mcp-js";
import { getMetrics } from "@/lib/juriscore/mock";

export default defineTool({
  name: "get_metrics",
  title: "Get governance metrics",
  description: "Return the current JurisCore KPI snapshot: violation rate, guardrail accuracy, average latency, audit-prep time, and per-domain volume.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const m = getMetrics();
    return {
      content: [
        {
          type: "text",
          text: `Requests: ${m.kpis.totalRequests}. Violation rate: ${(m.kpis.violationRate * 100).toFixed(2)}%. Guardrail accuracy: ${(m.kpis.guardrailAccuracy * 100).toFixed(1)}%. Avg latency: ${m.kpis.avgLatencyMs}ms.`,
        },
      ],
      structuredContent: m,
    };
  },
});
