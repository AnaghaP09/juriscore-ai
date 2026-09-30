import { createFileRoute } from "@tanstack/react-router";
import { createMcpHttpHandler } from "../lib/mcp/http";
import mcp from "../lib/mcp/index";

// The MCP endpoint (streamable HTTP). See src/lib/mcp/http.ts.
const handle = createMcpHttpHandler(mcp);

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the transport answers 405 instead.
      ANY: ({ request }) => handle(request),
    },
  },
});
