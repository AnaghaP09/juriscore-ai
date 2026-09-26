import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageStreamParams,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { sha256Hex } from "../../core/receipts";
import { canonicalJson } from "../../predict/envelope";
import type {
  GatewayAdapter,
  GatewayCompletion,
  GatewayVerifyResult,
  SanitizedGatewayRequest,
} from "../adapter";
import { gatewayModelSpec } from "../models";

/**
 * Anthropic adapter over the official SDK. Server-only: this is the one module that
 * imports `@anthropic-ai/sdk`, and it is reached only from the gateway route handlers.
 *
 * The transport is the SDK-shaped subset the adapter uses, so the checks inject a
 * deterministic fake (`./fake.ts`) and exercise the real parameter building and error
 * mapping with no network and no key.
 */

export interface AnthropicTransport {
  models: { retrieve(modelId: string): PromiseLike<unknown> };
  beta: {
    messages: {
      stream(params: BetaMessageStreamParams): { finalMessage(): PromiseLike<BetaMessage> };
    };
  };
}

export function createAnthropicTransport(apiKey: string): AnthropicTransport {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return {
    models: { retrieve: (modelId) => client.models.retrieve(modelId) },
    beta: { messages: { stream: (params) => client.beta.messages.stream(params) } },
  };
}

export const PROMPT_MAX_TOKENS = 16_000;

export const GATEWAY_SYSTEM_PROMPT =
  "You are answering through the JurisCore gateway. Before this message reached you, sensitive values were replaced with placeholders such as [REDACTED_EMAIL] or [EMAIL_1]. Treat each placeholder as an opaque value: refer to it as written, and never guess or reconstruct what it replaced.";

/** Maps an SDK error to a plain reason. Never includes key material or response bodies. */
export function describeProviderError(error: unknown): { reason: string; authFailure: boolean } {
  if (error instanceof AuthenticationError) {
    return { reason: "API key rejected", authFailure: true };
  }
  if (error instanceof PermissionDeniedError) {
    return { reason: "Key lacks access to this model", authFailure: true };
  }
  if (error instanceof NotFoundError) {
    return { reason: "Model not available to this account", authFailure: false };
  }
  if (error instanceof RateLimitError) {
    return { reason: "Rate limited, try again", authFailure: false };
  }
  if (error instanceof APIConnectionError) {
    return { reason: "Provider unreachable", authFailure: false };
  }
  if (error instanceof APIError) {
    return { reason: `Check failed (status ${error.status ?? "unknown"})`, authFailure: false };
  }
  return { reason: "Check failed (status unknown)", authFailure: false };
}

/** Request parameters for a free-form prompt, from the per-model table (P2-004). */
export function buildPromptParams(request: SanitizedGatewayRequest): BetaMessageStreamParams {
  const spec = gatewayModelSpec(request.modelId);
  if (!spec) throw new Error("The gateway has no parameters for this model.");
  const params: BetaMessageStreamParams = {
    model: request.modelId,
    max_tokens: PROMPT_MAX_TOKENS,
    system: GATEWAY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: request.prompt }],
  };
  if (spec.thinking) params.thinking = { type: "adaptive" };
  if (spec.effort) params.output_config = { effort: spec.effort.prompt };
  if (spec.fallbacks) {
    params.fallbacks = spec.fallbacks;
    params.betas = [...spec.betas];
  }
  return params;
}

function textOf(message: BetaMessage) {
  return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

export function createAnthropicAdapter(transport: AnthropicTransport): GatewayAdapter {
  return {
    provider: "anthropic",

    // `models.retrieve` spends no tokens and fails with the same typed errors a real
    // request would, which is what the connection badge needs to know.
    async verify(modelId): Promise<GatewayVerifyResult> {
      try {
        await transport.models.retrieve(modelId);
        return { ok: true };
      } catch (error) {
        return { ok: false, ...describeProviderError(error) };
      }
    },

    async complete(request): Promise<GatewayCompletion> {
      const params = buildPromptParams(request);
      const outboundDigest = await sha256Hex(canonicalJson(params));
      let message: BetaMessage;
      try {
        message = await transport.beta.messages.stream(params).finalMessage();
      } catch (error) {
        return { status: "error", outboundDigest, ...describeProviderError(error) };
      }
      const usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
      // stop_reason is read before content: a refusal or a cut-off answer is labelled,
      // never presented as a complete reply.
      if (message.stop_reason === "refusal") {
        return {
          status: "declined",
          category: message.stop_details?.category ?? null,
          usage,
          outboundDigest,
        };
      }
      return {
        status: message.stop_reason === "max_tokens" ? "truncated" : "ok",
        text: textOf(message),
        usage,
        outboundDigest,
      };
    },
  };
}
