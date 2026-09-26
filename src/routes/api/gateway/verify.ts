import { createFileRoute } from "@tanstack/react-router";

import { gatewayServer } from "../../../lib/juriscore/gateway/server";

// Live connection check for one allowlisted model (`models.retrieve`, no tokens spent).
export const Route = createFileRoute("/api/gateway/verify")({
  server: {
    handlers: {
      POST: ({ request }) => gatewayServer().handle("verify", request),
      // TanStack falls through to the app router for a method with no handler; the
      // pipeline answers any non-POST method with 405 and `Allow: POST`.
      ANY: ({ request }) => gatewayServer().handle("verify", request),
    },
  },
});
