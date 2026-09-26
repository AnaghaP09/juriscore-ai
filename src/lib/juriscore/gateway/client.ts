import type {
  GatewayErrorBody,
  GatewayPromptRunResponse,
  GatewayStatus,
  GatewayVerifyResponse,
  PromptRunRequest,
} from "./protocol";

/**
 * Browser client for the gateway routes. Same-origin POST with a JSON body only; the
 * session cookie is HttpOnly, so this module never sees it, and it never handles a
 * provider credential.
 */

export class GatewayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON answer (for example the app shell) is reported by status alone.
  }
  if (!response.ok) {
    const error = (payload ?? {}) as Partial<GatewayErrorBody>;
    throw new GatewayHttpError(response.status, error.error ?? "request-failed", error.message);
  }
  return payload as T;
}

export const gatewayClient = {
  unlock: (token: string) =>
    post<{ ok: true; expiresAt: string }>("/api/gateway/session", { token }),
  status: () => post<GatewayStatus>("/api/gateway/status", {}),
  verify: (modelId: string) => post<GatewayVerifyResponse>("/api/gateway/verify", { modelId }),
  runPrompt: (request: PromptRunRequest) =>
    post<GatewayPromptRunResponse>("/api/gateway/run", request),
};

/** True when the gateway needs the Unlock dialog (no session, or an expired one). */
export function needsUnlock(error: unknown) {
  return (
    error instanceof GatewayHttpError &&
    error.status === 401 &&
    (error.code === "session-expired" || error.code === "session-required")
  );
}

/**
 * Stale-response rule for prompt runs (PLAN-2 P2-016, R9 keyed by clientRequestId): only
 * the response to the latest request is shown; an older one that arrives late is dropped.
 */
export function createRunSequencer(prefix = "gw") {
  let generation = 0;
  let latest: string | null = null;
  return {
    next() {
      generation += 1;
      latest = `${prefix}-${Date.now().toString(36)}-${generation}`;
      return latest;
    },
    isCurrent(clientRequestId: string) {
      return latest !== null && clientRequestId === latest;
    },
    cancel() {
      latest = null;
    },
  };
}
