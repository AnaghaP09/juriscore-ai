import { GatewayHttpError, needsUnlock } from "./client";
import type { GatewayConnection, GatewayStatus, GatewayVerifyResponse } from "./protocol";

/**
 * The browser's unlock-and-verify flow as pure functions over a minimal client, so the
 * deterministic checks can drive it without React. `demo-store.tsx` wraps these.
 *
 * PLAN-5: after a successful unlock the status is loaded and the default model is
 * verified once, automatically. A status failure right after unlock is recoverable
 * ("unlocked, status unknown" + Retry), and a recoverable verify error keeps the
 * unlocked state and shows Retry instead of dropping to "unavailable".
 */

export interface FlowClient {
  status: () => Promise<GatewayStatus>;
  verify: (modelId: string) => Promise<GatewayVerifyResponse>;
}

export type UnlockOutcome =
  | { kind: "ready"; status: GatewayStatus; verified: GatewayVerifyResponse | null }
  | { kind: "locked"; expired: boolean }
  | { kind: "unavailable"; reason: "disabled" | "token-missing" }
  | { kind: "status-unknown"; message: string };

function messageOf(error: unknown) {
  return error instanceof Error && error.message ? error.message : "request failed";
}

/** Loads status after a successful session call, then verifies the default model once. */
export async function loadStatusAfterUnlock(
  client: FlowClient,
  preferredModelId?: string,
): Promise<UnlockOutcome> {
  let status: GatewayStatus;
  try {
    status = await client.status();
  } catch (error) {
    if (needsUnlock(error)) {
      return { kind: "locked", expired: (error as GatewayHttpError).code === "session-expired" };
    }
    if (error instanceof GatewayHttpError && error.status === 404) {
      return { kind: "unavailable", reason: "disabled" };
    }
    if (error instanceof GatewayHttpError && error.code === "gateway-token-missing") {
      return { kind: "unavailable", reason: "token-missing" };
    }
    return { kind: "status-unknown", message: messageOf(error) };
  }
  const modelId =
    preferredModelId && status.models.includes(preferredModelId)
      ? preferredModelId
      : status.defaultModelId;
  if (!status.configured || !modelId) return { kind: "ready", status, verified: null };
  // Always one live check after an unlock, even if the server still holds an older
  // "connected" state: a key revoked since then must not show as Connected.
  const verified = await verifyOnce(client, modelId);
  if (verified.kind === "locked") return verified;
  return {
    kind: "ready",
    status: { ...status, connections: { ...status.connections, [modelId]: verified.connection } },
    verified: verified.kind === "verified" ? verified.response : null,
  };
}

export type VerifyOutcome =
  | { kind: "verified"; connection: GatewayConnection; response: GatewayVerifyResponse }
  | { kind: "recoverable"; connection: GatewayConnection }
  | { kind: "locked"; expired: boolean };

/**
 * One verify call. Anything that is not a lost session becomes a `failed` connection with
 * a message, so the header keeps its Retry action and the session is not thrown away.
 */
export async function verifyOnce(client: FlowClient, modelId: string): Promise<VerifyOutcome> {
  try {
    const response = await client.verify(modelId);
    return { kind: "verified", connection: response.connection, response };
  } catch (error) {
    if (needsUnlock(error)) {
      return { kind: "locked", expired: (error as GatewayHttpError).code === "session-expired" };
    }
    return {
      kind: "recoverable",
      connection: {
        state: "failed",
        lastVerifiedAt: null,
        error: recoverableMessage(error),
      },
    };
  }
}

export function recoverableMessage(error: unknown) {
  if (error instanceof GatewayHttpError) {
    if (error.code === "busy" || error.code === "rate-limited") {
      return "The server is busy. Retry in a moment.";
    }
    if (error.code === "gateway-misconfigured" || error.code === "provider-key-missing") {
      return error.message;
    }
    return `Check failed (${error.code}).`;
  }
  return "Could not reach the server. Check your connection and retry.";
}

/**
 * Orders gateway state writes. Every status refresh or post-unlock recovery takes a ticket;
 * a successful unlock invalidates every ticket taken before it, so a delayed pre-unlock
 * answer (for example a 401) can never overwrite the unlocked state.
 */
export function createGenerationGuard() {
  let generation = 0;
  return {
    begin: () => generation,
    invalidate: () => ++generation,
    isCurrent: (ticket: number) => ticket === generation,
  };
}

/**
 * Runs post-unlock recoveries one at a time. A request that arrives while one is running
 * is queued and runs afterwards with its own, newer ticket; the earlier run's outcome is
 * dropped because its ticket is no longer current. Every request invalidates older tickets
 * first, so a delayed answer from before it can never write (P5-R4-001).
 */
export function createRecoveryScheduler(
  guard: ReturnType<typeof createGenerationGuard>,
  run: (ticket: number) => Promise<void>,
) {
  let inFlight = false;
  let queued: number | null = null;
  const drain = async (ticket: number): Promise<void> => {
    inFlight = true;
    try {
      await run(ticket);
    } finally {
      inFlight = false;
    }
    if (queued !== null) {
      const next = queued;
      queued = null;
      await drain(next);
    }
  };
  return {
    /** Invalidates earlier tickets and runs (or queues) a recovery for the new one. */
    request: () => {
      const ticket = guard.invalidate();
      if (inFlight) {
        queued = ticket;
        return Promise.resolve();
      }
      return drain(ticket);
    },
    isBusy: () => inFlight || queued !== null,
  };
}

/**
 * Per-model connection revisions (PLAN-6). A failure bumps the model's revision; a verify
 * response is applied only if the revision it started under is still current, so a delayed
 * success from before a failure can never restore "Connected". Only a verify that starts
 * after the failure can.
 */
export function createConnectionRevisions() {
  const revisions = new Map<string, number>();
  return {
    current: (modelId: string) => revisions.get(modelId) ?? 0,
    bump: (modelId: string) => {
      const next = (revisions.get(modelId) ?? 0) + 1;
      revisions.set(modelId, next);
      return next;
    },
    isCurrent: (modelId: string, revision: number) => (revisions.get(modelId) ?? 0) === revision,
  };
}

/** Text shown in the Unlock dialog for a failed session call. */
export function unlockFailureMessage(error: unknown) {
  if (error instanceof GatewayHttpError) {
    if (error.code === "token-rejected") {
      return "That phrase does not match the server's JURISCORE_GATEWAY_TOKEN. See Setup steps.";
    }
    if (error.code === "rate-limited") return "Too many attempts. Wait a minute and try again.";
    if (error.code === "https-required") {
      return "The gateway can be unlocked only from a browser on the server's own machine, at http://localhost. See Setup steps.";
    }
  }
  return "The gateway could not be unlocked.";
}
