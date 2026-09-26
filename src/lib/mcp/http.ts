import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnyToolDefinition, McpDefinition } from "./define";

/**
 * Serves the MCP protocol at `/mcp` over the SDK's stateless streamable HTTP transport.
 * A fresh server and transport are built per request, so no state crosses requests.
 * The endpoint is unauthenticated (this build persists nothing), sends CORS headers so
 * browser-based MCP clients can connect, and never logs tool arguments or results.
 */

const ALLOW_METHODS = "GET, POST, DELETE, OPTIONS";
const ALLOW_HEADERS =
  "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID";
const EXPOSE_HEADERS = "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version";

function withCors(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Expose-Headers", EXPOSE_HEADERS);
  return response;
}

function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  });
}

function toSdkCallback(tool: AnyToolDefinition) {
  return async (args?: unknown) => {
    try {
      const result = await tool.handler(tool.inputSchema ? (args ?? {}) : {});
      if (result == null) {
        return {
          content: [{ type: "text" as const, text: `tool "${tool.name}" returned no result` }],
          isError: true,
        };
      }
      return {
        content: result.content ?? [],
        structuredContent: result.structuredContent,
        isError: result.isError,
      };
    } catch {
      // The error may quote the input; the client gets a fixed message instead.
      return { content: [{ type: "text" as const, text: "tool execution failed" }], isError: true };
    }
  };
}

export function createMcpHttpHandler(mcp: McpDefinition) {
  const handle = async (request: Request): Promise<Response> => {
    try {
      const server = new McpServer(
        { name: mcp.name, version: mcp.version, title: mcp.title },
        { instructions: mcp.instructions },
      );
      // The SDK's per-schema generics recurse too deeply for a type-erased tool list, so the
      // boundary is typed loosely; each tool is already typed at its `defineTool` call.
      const registerTool = server.registerTool.bind(server) as (
        name: string,
        config: object,
        callback: ReturnType<typeof toSdkCallback>,
      ) => void;
      for (const tool of mcp.tools) {
        registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            annotations: tool.annotations,
          },
          toSdkCallback(tool),
        );
      }
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      return await transport.handleRequest(request);
    } catch {
      return Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32603, message: "internal error" } },
        { status: 500 },
      );
    }
  };

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return preflight();
    return withCors(await handle(request));
  };
}
