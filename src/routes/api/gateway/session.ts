import { createFileRoute } from "@tanstack/react-router";

import { gatewayServer } from "../../../lib/juriscore/gateway/server";

// Exchanges the JurisCore gateway token for an HttpOnly session cookie. Creates or renews.
export const Route = createFileRoute("/api/gateway/session")({
  server: {
    handlers: {
      POST: ({ request }) => gatewayServer().handle("session", request),
      // TanStack falls through to the app router for a method with no handler; the
      // pipeline answers any non-POST method with 405 and `Allow: POST`.
      ANY: ({ request }) => gatewayServer().handle("session", request),
    },
  },
});
