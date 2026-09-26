import type { VeilSanitized } from "../veil/engine";

/**
 * The provider seam. An adapter accepts only a request assembled from Veil-sanitized
 * text, so a raw string cannot reach transport by accident. Anthropic is the only
 * implementation in this build; the interface keeps providers replaceable.
 */

export interface GatewayRequest {
  purpose: "prompt";
  modelId: string;
  prompt: VeilSanitized<string>;
}

export type SanitizedGatewayRequest = VeilSanitized<GatewayRequest>;

/** Every text field is already branded, so sealing the request is a type-level step only. */
export function sealGatewayRequest(request: GatewayRequest): SanitizedGatewayRequest {
  return request as SanitizedGatewayRequest;
}

export interface GatewayUsage {
  inputTokens: number;
  outputTokens: number;
}

export type GatewayVerifyResult =
  | { ok: true }
  | { ok: false; reason: string; authFailure: boolean };

export type GatewayCompletion =
  | {
      status: "ok" | "truncated";
      text: string;
      usage: GatewayUsage;
      outboundDigest: string;
    }
  | {
      status: "declined";
      category: string | null;
      usage: GatewayUsage;
      outboundDigest: string;
    }
  | {
      status: "error";
      reason: string;
      authFailure: boolean;
      outboundDigest: string;
    };

export interface GatewayAdapter {
  provider: "anthropic";
  verify(modelId: string): Promise<GatewayVerifyResult>;
  complete(request: SanitizedGatewayRequest): Promise<GatewayCompletion>;
}
