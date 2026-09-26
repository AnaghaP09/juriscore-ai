import { z } from "zod";
import type { ValidationReceipt, ValidatorVerdict } from "../core/contracts";

/**
 * Wire shapes shared by the gateway routes and the browser client. Every text field is
 * size-capped; the server answers an oversized field with 413 and any other schema
 * failure with 400, naming the field but never echoing its value.
 */

export const GATEWAY_PROMPT_MAX_CHARS = 32_000;
export const GATEWAY_TOKEN_MAX_CHARS = 512;

const shortText = (max: number) => z.string().max(max);

export const policyDefinitionSchema = z
  .object({
    id: z.string().min(1).max(160),
    name: shortText(200),
    shortName: shortText(200),
    version: shortText(120),
    authority: shortText(200),
    description: shortText(2_000),
    features: z.array(z.enum(["veil", "plumb"])).max(2),
    veilScopes: z.array(z.enum(["common", "healthcare", "secrets", "prompt_security"])).max(4),
    defaultActive: z.boolean(),
    custom: z.boolean().optional(),
    source: z
      .object({
        title: shortText(200),
        publisher: shortText(200),
        url: shortText(2_000),
        retrievedAt: shortText(40),
      })
      .strict(),
  })
  .strict();

export const policyConfigSchema = z
  .object({
    /** Resolved server-side against the same catalog the browser uses. */
    builtInIds: z.array(z.string().min(1).max(160)).max(50),
    /** Request-scoped: validated, applied to this request only, never stored. */
    custom: z.array(policyDefinitionSchema).max(50),
    profile: z.enum(["saas_operations", "healthcare", "all_sensitive"]),
    strategy: z.enum(["redact", "tokenize"]),
  })
  .strict();

export type GatewayPolicyConfig = z.infer<typeof policyConfigSchema>;

export const sessionRequestSchema = z
  .object({ token: z.string().min(1).max(GATEWAY_TOKEN_MAX_CHARS) })
  .strict();

export const verifyRequestSchema = z.object({ modelId: z.string().min(1).max(100) }).strict();

export const promptRunRequestSchema = z
  .object({
    purpose: z.literal("prompt"),
    modelId: z.string().min(1).max(100),
    policy: policyConfigSchema,
    prompt: z.string().min(1).max(GATEWAY_PROMPT_MAX_CHARS),
    clientRequestId: z.string().min(1).max(100),
  })
  .strict();

export type PromptRunRequest = z.infer<typeof promptRunRequestSchema>;

/** Prediction purposes are defined by PLAN-2 G.5 and are not served by this build. */
export const DEFERRED_RUN_PURPOSES = ["drift-risk", "residual-exposure"] as const;

export type GatewayConnectionState = "not_connected" | "connected" | "failed";

export interface GatewayConnection {
  state: GatewayConnectionState;
  lastVerifiedAt: string | null;
  error?: string;
}

export interface GatewayStatus {
  enabled: true;
  configured: boolean;
  /** Why the gateway is not configured. Never contains key material. */
  configError?: string;
  provider: "anthropic";
  providerLabel: "Anthropic";
  models: string[];
  defaultModelId: string | null;
  connections: Record<string, GatewayConnection>;
}

export interface GatewayVerifyResponse {
  modelId: string;
  connection: GatewayConnection;
}

export interface GatewayCheckFinding {
  category: string;
  label: string;
  severity: "high" | "medium";
  count: number;
}

export interface GatewayCheckSummary {
  rawVerdict: ValidatorVerdict;
  sanitizedVerdict: ValidatorVerdict;
  findings: GatewayCheckFinding[];
}

export type GatewayRunStatus = "ok" | "blocked" | "declined" | "truncated";

export interface GatewayRunRecord {
  clientRequestId: string;
  modelId: string;
  status: GatewayRunStatus;
  /** Plain reason for a blocked or declined run. Never contains a detected value. */
  reason?: string;
  declineCategory?: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  latencyMs: number;
  requestDigest: string;
  outboundDigest: string | null;
  inputCheck: GatewayCheckSummary;
  outputCheck: GatewayCheckSummary | null;
}

export interface GatewayPromptRunResponse {
  run: GatewayRunRecord;
  /** Held in component state only; never persisted. */
  display: { output: string | null };
  receipt: ValidationReceipt;
}

export interface GatewayErrorBody {
  error: string;
  message?: string;
  field?: string;
}
