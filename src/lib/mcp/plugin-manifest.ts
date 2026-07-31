// Plugin manifest describing how a host tool (ChatGPT, Claude, Cursor, or any
// MCP-aware client) connects to this app's MCP server.
// Served at /.well-known/ai-plugin.json and /api/public/plugin-manifest.

export const PLUGIN_TOOLS = [
  {
    name: "check_prompt",
    title: "Check prompt (input guardrail)",
    description: "Scan a prompt for PII/PHI, prompt-injection, and restricted concepts before it reaches the model.",
  },
  {
    name: "retrieve_policy",
    title: "Retrieve policy clauses",
    description: "Look up the most relevant policy clauses from the selected domain rulebook (SEC/FINRA, HIPAA/CMS).",
  },
  {
    name: "enforce_citations",
    title: "Enforce citations (output guardrail)",
    description: "Verify every regulatory claim in a draft response is grounded in an approved policy clause.",
  },
  {
    name: "evaluate_response",
    title: "Evaluate response (end-to-end)",
    description: "Run the full pipeline: input guardrail, policy retrieval, citation enforcement; returns a verdict.",
  },
  {
    name: "get_audit_entry",
    title: "Get audit entry",
    description: "Fetch the full chain-of-checks for a prior JurisCore interaction by ID.",
  },
  {
    name: "get_metrics",
    title: "Get governance metrics",
    description: "Return the current governance KPI snapshot for the workspace.",
  },
] as const;

export function buildPluginManifest(origin: string) {
  return {
    schema_version: "v1",
    name_for_human: "JurisCore AI",
    name_for_model: "juriscore_ai",
    description_for_human:
      "Compliance guardrails for AI answers: scrub sensitive data, ground claims in your rulebook, and keep an audit receipt.",
    description_for_model:
      "Governance middleware for regulated domains (finance, healthcare, legal). Call check_prompt before sending a user prompt to a model, retrieve_policy to ground answers in an approved rulebook, enforce_citations to verify a draft response, and evaluate_response to run the full pipeline in one call.",
    contact_email: "support@juriscore.ai",
    legal_info_url: `${origin}/connect`,
    logo_url: `${origin}/favicon.ico`,
    api: {
      type: "mcp",
      transport: "streamable-http",
      url: `${origin}/mcp`,
      is_user_authenticated: false,
    },
    auth: { type: "none" },
    tools: PLUGIN_TOOLS,
    connection: {
      // Copy-paste config for MCP clients.
      mcpServers: {
        juriscore: { url: `${origin}/mcp` },
      },
      metadata_url: `${origin}/.well-known/oauth-protected-resource`,
      manifest_url: `${origin}/.well-known/ai-plugin.json`,
    },
  };
}

export function manifestResponse(request: Request): Response {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = forwardedHost ? `${forwardedProto ?? "https"}://${forwardedHost}` : url.origin;

  return new Response(JSON.stringify(buildPluginManifest(origin), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
