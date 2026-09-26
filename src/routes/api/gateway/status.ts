import { createFileRoute } from "@tanstack/react-router";

import { gatewayServer } from "../../../lib/juriscore/gateway/server";

// Gateway configuration and per-model connection state. Never returns key material.
export const Route = createFileRoute("/api/gateway/status")({
  server: {
    handlers: {
      POST: ({ request }) => gatewayServer().handle("status", request),
      // TanStack falls through to the app router for a method with no handler; the
      // pipeline answers any non-POST method with 405 and `Allow: POST`.
      ANY: ({ request }) => gatewayServer().handle("status", request),
    },
  },
});
