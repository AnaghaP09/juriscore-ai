import {
  APIConnectionError,
  AuthenticationError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageStreamParams,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AnthropicTransport } from "./anthropic";

/**
 * Deterministic, network-free stand-in for the Anthropic SDK client. It is injected in
 * place of the real transport so the checks run the real adapter: parameter building,
 * stop-reason handling, and typed-error mapping. It records every payload it would have
 * sent so a check can scan transport for anything that should never leave the process.
 */

export type FakeProviderFailure =
  | "authentication"
  | "permission"
  | "not_found"
  | "rate_limit"
  | "connection"
  | "server";

export type FakeReply =
  | { kind: "text"; text: string; stopReason?: "end_turn" | "max_tokens" }
  | { kind: "refusal"; category: "cyber" | "bio" | "frontier_llm" | "reasoning_extraction" | null }
  | { kind: "failure"; failure: FakeProviderFailure };

export function fakeProviderError(failure: FakeProviderFailure): Error {
  const headers = new Headers();
  switch (failure) {
    case "authentication":
      return new AuthenticationError(401, undefined, "invalid x-api-key", headers);
    case "permission":
      return new PermissionDeniedError(403, undefined, "permission denied", headers);
    case "not_found":
      return new NotFoundError(404, undefined, "model not found", headers);
    case "rate_limit":
      return new RateLimitError(429, undefined, "rate limited", headers);
    case "connection":
      return new APIConnectionError({ message: "connection refused" });
    case "server":
      return new InternalServerError(529, undefined, "overloaded", headers);
  }
}

export interface FakeTransport extends AnthropicTransport {
  /** Model ids passed to `models.retrieve`, in order. */
  readonly retrieved: string[];
  /** Every payload passed to `beta.messages.stream`, in order. */
  readonly sent: BetaMessageStreamParams[];
  /** Outcome of the next `models.retrieve` per model id; defaults to success. */
  verifyOutcome: Map<string, FakeProviderFailure | "ok">;
  /** Reply for the next completions, consumed in order; the last one repeats. */
  replies: FakeReply[];
}

function message(params: BetaMessageStreamParams, reply: FakeReply): BetaMessage {
  let stopReason = "end_turn";
  if (reply.kind === "refusal") stopReason = "refusal";
  else if (reply.kind === "text") stopReason = reply.stopReason ?? "end_turn";
  const text = reply.kind === "text" ? reply.text : "";
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: params.model,
    content: text ? [{ type: "text", text, citations: null }] : [],
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details:
      reply.kind === "refusal"
        ? { type: "refusal", category: reply.category, explanation: null }
        : null,
    usage: { input_tokens: 42, output_tokens: text ? 17 : 0 },
  } as unknown as BetaMessage;
}

export function createFakeTransport(): FakeTransport {
  const transport: FakeTransport = {
    retrieved: [],
    sent: [],
    verifyOutcome: new Map(),
    replies: [{ kind: "text", text: "A deterministic reply from the fake provider." }],
    models: {
      async retrieve(modelId: string) {
        transport.retrieved.push(modelId);
        const outcome = transport.verifyOutcome.get(modelId) ?? "ok";
        if (outcome !== "ok") throw fakeProviderError(outcome);
        return { id: modelId, type: "model" };
      },
    },
    beta: {
      messages: {
        stream(params: BetaMessageStreamParams) {
          transport.sent.push(structuredClone(params));
          const reply =
            transport.replies.length > 1 ? transport.replies.shift()! : transport.replies[0];
          return {
            async finalMessage() {
              if (reply.kind === "failure") throw fakeProviderError(reply.failure);
              return message(params, reply);
            },
          };
        },
      },
    },
  };
  return transport;
}
