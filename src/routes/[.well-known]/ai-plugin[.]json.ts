import { createFileRoute } from "@tanstack/react-router";
import { manifestResponse } from "@/lib/mcp/plugin-manifest";

export const Route = createFileRoute("/.well-known/ai-plugin.json")({
  server: {
    handlers: {
      GET: ({ request }) => manifestResponse(request),
    },
  },
});
