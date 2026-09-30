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
  if (status.connections[modelId]?.state === "connected") {
    return { kind: "ready", status, verified: null };
  }
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
