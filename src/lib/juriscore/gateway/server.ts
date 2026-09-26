import { z } from "zod";
import { validationReceiptSchema, type ValidatorVerdict } from "../core/contracts";
import { encodePolicyVersion, sha256Hex } from "../core/receipts";
import {
  BUILT_IN_POLICIES,
  policiesForFeature,
  veilScopesForPolicies,
  type PolicyDefinition,
} from "../policies/catalog";
import { canonicalJson } from "../predict/envelope";
import {
  protectText,
  sanitizeForProvider,
  type VeilProtectOptions,
  type VeilResult,
} from "../veil/engine";
import {
  ConcurrencyGate,
  FixedWindowLimiter,
  createSessionSecret,
  isJsonRequest,
  issueSessionCookie,
  originAllowed,
  readSession,
  tokenMatches,
  type SessionSecret,
} from "./access";
import { sealGatewayRequest, type GatewayAdapter } from "./adapter";
import {
  createAnthropicAdapter,
  createAnthropicTransport,
  type AnthropicTransport,
} from "./adapter/anthropic";
import {
  GatewayConfigError,
  processEnv,
  readAccessConfig,
  readProviderApiKey,
  readProviderConfig,
  type GatewayEnv,
  type GatewayProviderConfig,
} from "./config";
import { gatewayModelSpec } from "./models";
import {
  DEFERRED_RUN_PURPOSES,
  promptRunRequestSchema,
  sessionRequestSchema,
  verifyRequestSchema,
  type GatewayCheckSummary,
  type GatewayConnection,
  type GatewayPolicyConfig,
  type GatewayPromptRunResponse,
  type GatewayRunRecord,
  type GatewayStatus,
  type PromptRunRequest,
} from "./protocol";

/**
 * The gateway request pipeline, independent of the web framework. Route files call
 * `handle`; the checks construct their own server with a fake transport.
 *
 * Order of every request (PLAN-2 decision 6, G.2): enabled → token configured →
 * method → origin → JSON content type → rate limit → kill switch (run) → body size and
 * schema → session cookie. Each rejection happens before Veil runs, before an adapter is
 * built, and before the provider key is read.
 */

export type GatewayRoute = "session" | "status" | "verify" | "run";

export const GATEWAY_ROUTES: readonly GatewayRoute[] = ["session", "status", "verify", "run"];

export interface GatewayServerDeps {
  env: () => GatewayEnv;
  createTransport?: (apiKey: string) => AnthropicTransport;
  /** Seams so the checks can prove the gate rejects before Veil runs. */
  sanitize?: typeof sanitizeForProvider;
  protect?: typeof protectText;
  now?: () => number;
  sessionSecret?: SessionSecret;
  log?: (message: string) => void;
}

export interface GatewayServer {
  handle(route: GatewayRoute, request: Request): Promise<Response>;
}

const MAX_BODY_BYTES: Record<GatewayRoute, number> = {
  session: 4_096,
  status: 1_024,
  verify: 1_024,
  run: 512_000,
};

const RATE_LIMITS: Record<GatewayRoute, { limit: number; windowMs: number }> = {
  session: { limit: 10, windowMs: 60_000 },
  status: { limit: 120, windowMs: 60_000 },
  verify: { limit: 20, windowMs: 60_000 },
  run: { limit: 30, windowMs: 60_000 },
};

const MAX_PROVIDER_CALLS_IN_FLIGHT = 2;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function fail(status: number, error: string, message?: string, field?: string) {
  return json(status, { error, ...(message ? { message } : {}), ...(field ? { field } : {}) });
}

export function methodNotAllowed() {
  return json(405, { error: "method-not-allowed" }, { allow: "POST" });
}

const statusRequestSchema = z.object({}).strict();

/** Read first so a prediction purpose gets a plain "not available", not a schema error. */
const runPurposeSchema = z.object({ purpose: z.string().max(40) }).passthrough();

type BodyResult<T> = { ok: true; value: T } | { ok: false; response: Response };

async function readJson(request: Request, maxBytes: number): Promise<BodyResult<unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return { ok: false, response: fail(413, "body-too-large") };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, response: fail(413, "body-too-large") };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: fail(400, "invalid-json") };
  }
}

async function readBody<T>(
  request: Request,
  maxBytes: number,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<BodyResult<T>> {
  const raw = await readJson(request, maxBytes);
  return raw.ok ? validate(raw.value, schema) : raw;
}

function validate<T>(raw: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): BodyResult<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  // Name the field, never its value.
  const oversized = parsed.error.issues.find(
    (issue) => issue.code === "too_big" && issue.type === "string",
  );
  if (oversized) {
    return {
      ok: false,
      response: fail(413, "field-too-large", undefined, oversized.path.join(".")),
    };
  }
  const first = parsed.error.issues[0];
  return {
    ok: false,
    response: fail(400, "invalid-request", first?.message, first?.path.join(".")),
  };
}

interface ResolvedPolicy {
  options: VeilProtectOptions;
  refs: { id: string; version: string }[];
  /** The policy config as it enters the request digest: order-independent. */
  canonical: unknown;
}

function resolvePolicy(config: GatewayPolicyConfig): ResolvedPolicy | { error: string } {
  const builtInIds = [...new Set(config.builtInIds)].sort();
  const unknown = builtInIds.filter((id) => !BUILT_IN_POLICIES.some((policy) => policy.id === id));
  if (unknown.length > 0) return { error: `Unknown built-in policy: ${unknown.join(", ")}` };
  // Code-unit order, not locale order: the digest must not depend on the server's locale.
  const custom = [...config.custom].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  ) as PolicyDefinition[];
  if (custom.some((policy) => BUILT_IN_POLICIES.some((builtIn) => builtIn.id === policy.id))) {
    return { error: "A custom policy may not reuse a built-in policy id." };
  }
  if (new Set(custom.map((policy) => policy.id)).size !== custom.length) {
    return { error: "Custom policy ids must be unique." };
  }
  const policyIds = [...builtInIds, ...custom.map((policy) => policy.id)];
  const refs = policiesForFeature(policyIds, "veil", custom).map((policy) => ({
    id: policy.id,
    version: policy.version,
  }));
  return {
    options: {
      strategy: config.strategy,
      profile: config.profile,
      policyIds,
      policyScopes: veilScopesForPolicies(policyIds, custom),
    },
    refs,
    canonical: { builtInIds, custom, profile: config.profile, strategy: config.strategy },
  };
}

function summarize(result: VeilResult): GatewayCheckSummary {
  return {
    rawVerdict: result.rawVerdict,
    sanitizedVerdict: result.sanitizedVerdict,
    findings: result.findings.map((finding) => ({
      category: finding.category,
      label: finding.label,
      severity: finding.severity,
      count: finding.count,
    })),
  };
}

const VERDICT_RANK: Record<ValidatorVerdict, number> = { allow: 0, revise: 1, block: 2 };

function worst(...verdicts: ValidatorVerdict[]): ValidatorVerdict {
  return verdicts.reduce((a, b) => (VERDICT_RANK[b] > VERDICT_RANK[a] ? b : a), "allow");
}

export function createGatewayServer(deps: GatewayServerDeps): GatewayServer {
  const now = deps.now ?? (() => Date.now());
  const sanitize = deps.sanitize ?? sanitizeForProvider;
  const protect = deps.protect ?? protectText;
  const createTransport = deps.createTransport ?? createAnthropicTransport;
  const log = deps.log ?? ((message: string) => console.warn(message));
  const secret = deps.sessionSecret ?? createSessionSecret();
  const limiters = Object.fromEntries(
    GATEWAY_ROUTES.map((route) => [
      route,
      new FixedWindowLimiter(RATE_LIMITS[route].limit, RATE_LIMITS[route].windowMs),
    ]),
  ) as Record<GatewayRoute, FixedWindowLimiter>;
  const providerCalls = new ConcurrencyGate(MAX_PROVIDER_CALLS_IN_FLIGHT);
  // In-process only, keyed by model id; never persisted and never holds a secret.
  const connections = new Map<string, GatewayConnection>();
  const logged = new Set<string>();

  const logOnce = (key: string, message: string) => {
    if (logged.has(key)) return;
    logged.add(key);
    log(message);
  };

  const connectionFor = (modelId: string): GatewayConnection =>
    connections.get(modelId) ?? { state: "not_connected", lastVerifiedAt: null };

  function adapterFor(env: GatewayEnv): GatewayAdapter | null {
    const apiKey = readProviderApiKey(env);
    return apiKey ? createAnthropicAdapter(createTransport(apiKey)) : null;
  }

  function status(provider: GatewayProviderConfig | { error: string }): Response {
    if ("error" in provider) {
      const body: GatewayStatus = {
        enabled: true,
        configured: false,
        configError: provider.error,
        provider: "anthropic",
        providerLabel: "Anthropic",
        models: [],
        defaultModelId: null,
        connections: {},
      };
      return json(200, body);
    }
    const body: GatewayStatus = {
      enabled: true,
      configured: provider.keyConfigured,
      ...(provider.keyConfigured ? {} : { configError: "ANTHROPIC_API_KEY is not set." }),
      provider: "anthropic",
      providerLabel: "Anthropic",
      models: provider.models,
      defaultModelId: provider.defaultModelId,
      connections: Object.fromEntries(provider.models.map((id) => [id, connectionFor(id)])),
    };
    return json(200, body);
  }

  async function verify(
    env: GatewayEnv,
    provider: GatewayProviderConfig,
    modelId: string,
  ): Promise<Response> {
    if (!provider.models.includes(modelId)) return fail(400, "model-not-allowed");
    const adapter = adapterFor(env);
    if (!adapter) return fail(503, "provider-key-missing", "ANTHROPIC_API_KEY is not set.");
    const release = providerCalls.tryAcquire();
    if (!release) return fail(429, "busy", "Too many provider calls in flight.");
    try {
      const result = await adapter.verify(modelId);
      // "Connected" needs both a live check and a parameter row for the model.
      const connection: GatewayConnection =
        result.ok && gatewayModelSpec(modelId)
          ? { state: "connected", lastVerifiedAt: new Date(now()).toISOString() }
          : {
              state: "failed",
              lastVerifiedAt: new Date(now()).toISOString(),
              error: result.ok ? "No request parameters for this model" : result.reason,
            };
      connections.set(modelId, connection);
      return json(200, { modelId, connection });
    } finally {
      release();
    }
  }

  async function run(
    env: GatewayEnv,
    provider: GatewayProviderConfig,
    request: PromptRunRequest,
  ): Promise<Response> {
    if (!provider.models.includes(request.modelId)) return fail(400, "model-not-allowed");
    if (connectionFor(request.modelId).state !== "connected") {
      return fail(409, "model-not-connected", "Test the connection to this model first.");
    }
    const policy = resolvePolicy(request.policy);
    if ("error" in policy) return fail(400, "invalid-policy", policy.error);
    const adapter = adapterFor(env);
    if (!adapter) return fail(503, "provider-key-missing", "ANTHROPIC_API_KEY is not set.");
    const release = providerCalls.tryAcquire();
    if (!release) return fail(429, "busy", "Too many provider calls in flight.");
    const started = now();
    try {
      // Digest of the original request, computed here only (P2-016).
      const requestDigest = await sha256Hex(
        canonicalJson({
          digestVersion: "gateway.request.v1",
          modelId: request.modelId,
          policy: policy.canonical,
          prompt: request.prompt,
        }),
      );
      const sanitized = sanitize(request.prompt, policy.options);
      const inputCheck = summarize(sanitized.result);
      const createdAt = new Date(now()).toISOString();
      const receiptBase = {
        id: `receipt.gateway.${createdAt}.${requestDigest.slice(0, 8)}`,
        module: "gateway" as const,
        policyVersion: encodePolicyVersion(policy.refs),
        inputDigest: requestDigest,
        evidence: [],
        maturity: "synthetic" as const,
        createdAt,
        digestVersion: "gateway.request.v1",
      };
      const inputFindingIds = sanitized.result.findings.map((finding) => `input:${finding.id}`);

      if (sanitized.blocked) {
        const record: GatewayRunRecord = {
          clientRequestId: request.clientRequestId,
          modelId: request.modelId,
          status: "blocked",
          reason: sanitized.reason,
          usage: null,
          latencyMs: now() - started,
          requestDigest,
          outboundDigest: null,
          inputCheck,
          outputCheck: null,
        };
        const body: GatewayPromptRunResponse = {
          run: record,
          display: { output: null },
          receipt: validationReceiptSchema.parse({
            ...receiptBase,
            verdict: "block",
            findingIds: inputFindingIds,
          }),
        };
        return json(200, body);
      }

      const completion = await adapter.complete(
        sealGatewayRequest({ purpose: "prompt", modelId: request.modelId, prompt: sanitized.text }),
      );
      if (completion.status === "error") {
        if (completion.authFailure) {
          connections.set(request.modelId, {
            state: "failed",
            lastVerifiedAt: new Date(now()).toISOString(),
            error: completion.reason,
          });
        }
        return fail(502, "provider-error", completion.reason);
      }

      // The reply is checked by Veil on the way back, under the same policies.
      const output =
        completion.status === "declined" ? null : protect(completion.text, policy.options);
      const outputCheck = output ? summarize(output) : null;
      const record: GatewayRunRecord = {
        clientRequestId: request.clientRequestId,
        modelId: request.modelId,
        status: completion.status,
        ...(completion.status === "declined"
          ? {
              reason: "The model declined this request.",
              declineCategory: completion.category,
            }
          : {}),
        usage: completion.usage,
        latencyMs: now() - started,
        requestDigest,
        outboundDigest: completion.outboundDigest,
        inputCheck,
        outputCheck,
      };
      const body: GatewayPromptRunResponse = {
        run: record,
        display: { output: output ? output.sanitizedText : null },
        receipt: validationReceiptSchema.parse({
          ...receiptBase,
          outboundDigest: completion.outboundDigest,
          // Veil's verdicts decide: the raw input's, and the reply's.
          verdict: worst(sanitized.result.rawVerdict, output?.rawVerdict ?? "allow"),
          findingIds: [
            ...inputFindingIds,
            ...(output?.findings.map((finding) => `output:${finding.id}`) ?? []),
          ],
        }),
      };
      return json(200, body);
    } finally {
      release();
    }
  }

  async function handle(route: GatewayRoute, request: Request): Promise<Response> {
    const env = deps.env();
    const access = readAccessConfig(env);
    if (!access.enabled) return fail(404, "gateway-disabled");
    if (!access.token) {
      logOnce(
        "token",
        "JurisCore gateway is enabled but JURISCORE_GATEWAY_TOKEN is missing or shorter than 16 characters; every gateway request is refused.",
      );
      return fail(503, "gateway-token-missing");
    }
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed();
    if (!originAllowed(request)) return fail(403, "origin-rejected");
    if (!isJsonRequest(request)) return fail(415, "json-required");
    if (!limiters[route].take(now())) return fail(429, "rate-limited");
    if (route === "run" && access.killed) return fail(503, "kill-switch");

    if (route === "session") {
      const body = await readBody(request, MAX_BODY_BYTES.session, sessionRequestSchema);
      if (!body.ok) return body.response;
      // The one route exempt from the cookie check: it creates or renews the session.
      if (!(await tokenMatches(body.value.token, access.token))) {
        return fail(401, "token-rejected");
      }
      const issued = await issueSessionCookie(secret, now(), new URL(request.url));
      return json(200, { ok: true, expiresAt: issued.expiresAt }, { "set-cookie": issued.cookie });
    }

    const session = await readSession(request, secret, now());
    if (session !== "valid") {
      return fail(401, session === "expired" ? "session-expired" : "session-required");
    }

    let provider: GatewayProviderConfig | { error: string };
    try {
      provider = readProviderConfig(env);
    } catch (error) {
      if (!(error instanceof GatewayConfigError)) throw error;
      logOnce("config", `JurisCore gateway configuration is invalid: ${error.message}`);
      provider = { error: error.message };
    }

    if (route === "status") {
      const body = await readBody(request, MAX_BODY_BYTES.status, statusRequestSchema);
      if (!body.ok) return body.response;
      return status(provider);
    }
    if ("error" in provider) return fail(503, "gateway-misconfigured", provider.error);

    if (route === "verify") {
      const body = await readBody(request, MAX_BODY_BYTES.verify, verifyRequestSchema);
      if (!body.ok) return body.response;
      return verify(env, provider, body.value.modelId);
    }

    const raw = await readJson(request, MAX_BODY_BYTES.run);
    if (!raw.ok) return raw.response;
    const purpose = validate(raw.value, runPurposeSchema);
    if (!purpose.ok) return purpose.response;
    if ((DEFERRED_RUN_PURPOSES as readonly string[]).includes(purpose.value.purpose)) {
      return fail(
        400,
        "purpose-not-available",
        "Prediction purposes are not served by this build.",
      );
    }
    const body = validate(raw.value, promptRunRequestSchema);
    if (!body.ok) return body.response;
    return run(env, provider, body.value);
  }

  return { handle };
}

declare global {
  var __juriscoreGatewayServer: GatewayServer | undefined;
}

/** The process-wide server used by the route files, reading `process.env` per request. */
export function gatewayServer(): GatewayServer {
  globalThis.__juriscoreGatewayServer ??= createGatewayServer({ env: processEnv });
  return globalThis.__juriscoreGatewayServer;
}
