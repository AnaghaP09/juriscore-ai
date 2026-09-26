import { createFileRoute } from "@tanstack/react-router";

import { gatewayServer } from "../../../lib/juriscore/gateway/server";

// One model request: access gate, Veil, sanitize-for-provider, adapter, Veil on the reply.
export const Route = createFileRoute("/api/gateway/run")({
  server: {
    handlers: {
      POST: ({ request }) => gatewayServer().handle("run", request),
      // TanStack falls through to the app router for a method with no handler; the
      // pipeline answers any non-POST method with 405 and `Allow: POST`.
      ANY: ({ request }) => gatewayServer().handle("run", request),
    },
  },
});
