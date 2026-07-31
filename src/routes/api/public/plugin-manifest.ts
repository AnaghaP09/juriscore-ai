import { createFileRoute } from "@tanstack/react-router";
import { manifestResponse } from "@/lib/mcp/plugin-manifest";

export const Route = createFileRoute("/api/public/plugin-manifest")({
  server: {
    handlers: {
      GET: ({ request }) => manifestResponse(request),
    },
  },
});
