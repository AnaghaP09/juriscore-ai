import { DEFAULT_GATEWAY_MODEL_ID, gatewayModelSpec } from "./models";

/**
 * Gateway configuration, read from server environment only. Nothing here is ever sent
 * to the browser except the model allowlist and yes/no facts about configuration.
 *
 * Reading is split in two so the access gate can run before any provider credential is
 * used: `readAccessConfig` looks only at whether a key is present (a boolean), never at
 * its value. The one exception is the once-per-process check in the server that refuses
 * an unlock phrase equal to the key.
 *
 * Variable names are provider-agnostic (PLAN-5): `JURISCORE_LLM_API_KEY` holds the
 * proprietary LLM API key and `JURISCORE_LLM_PROVIDER` names the provider. The legacy
 * `ANTHROPIC_API_KEY` is still read when the new name is empty.
 */

export type GatewayEnv = Readonly<Record<string, string | undefined>>;

export class GatewayConfigError extends Error {}

/** Shorter tokens are treated as absent: the gateway stays closed rather than guessable. */
export const MIN_GATEWAY_TOKEN_LENGTH = 16;

export const API_KEY_VARIABLE = "JURISCORE_LLM_API_KEY";
export const LEGACY_API_KEY_VARIABLE = "ANTHROPIC_API_KEY";
export const PROVIDER_VARIABLE = "JURISCORE_LLM_PROVIDER";

/** Every variable the server reads. `.env.example` must list each one (checked). */
export const GATEWAY_ENV_VARIABLES = [
  API_KEY_VARIABLE,
  "JURISCORE_GATEWAY",
  "JURISCORE_GATEWAY_TOKEN",
  PROVIDER_VARIABLE,
  "JURISCORE_GATEWAY_MODELS",
  "JURISCORE_GATEWAY_KILL",
  LEGACY_API_KEY_VARIABLE,
] as const;

export type GatewayProviderId = "anthropic";
export const SUPPORTED_PROVIDERS: readonly GatewayProviderId[] = ["anthropic"];
export const PROVIDER_LABELS: Record<GatewayProviderId, string> = { anthropic: "Anthropic" };

export interface GatewayAccessConfig {
  enabled: boolean;
  token: string | null;
  killed: boolean;
}

function keyPresent(env: GatewayEnv) {
  return Boolean(env[API_KEY_VARIABLE]?.trim() || env[LEGACY_API_KEY_VARIABLE]?.trim());
}

/**
 * The gateway is on when a key is set, unless `JURISCORE_GATEWAY=disabled`.
 * `JURISCORE_GATEWAY=enabled` also turns it on (the documented, explicit form).
 */
export function readAccessConfig(env: GatewayEnv): GatewayAccessConfig {
  const token = env.JURISCORE_GATEWAY_TOKEN?.trim() ?? "";
  const kill = env.JURISCORE_GATEWAY_KILL?.trim().toLowerCase();
  const gatewaySwitch = env.JURISCORE_GATEWAY?.trim().toLowerCase() ?? "";
  const enabled =
    gatewaySwitch === "enabled" || (gatewaySwitch !== "disabled" && keyPresent(env));
  return {
    enabled,
    token: token.length >= MIN_GATEWAY_TOKEN_LENGTH ? token : null,
    killed: kill === "1" || kill === "true",
  };
}

export interface GatewayProviderConfig {
  provider: GatewayProviderId;
  providerLabel: string;
  models: string[];
  defaultModelId: string;
  keyConfigured: boolean;
}

/**
 * Validates the provider name and the model allowlist. An unknown provider or model id is
 * a configuration error, never something shown as connectable.
 */
export function readProviderConfig(env: GatewayEnv): GatewayProviderConfig {
  const providerRaw = env[PROVIDER_VARIABLE]?.trim().toLowerCase() ?? "";
  const provider = (providerRaw || "anthropic") as GatewayProviderId;
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new GatewayConfigError(
      `${PROVIDER_VARIABLE} is "${providerRaw}"; this build supports only: ${SUPPORTED_PROVIDERS.join(", ")}.`,
    );
  }
  const raw = env.JURISCORE_GATEWAY_MODELS?.trim();
  const models = raw
    ? [
        ...new Set(
          raw
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ]
    : [DEFAULT_GATEWAY_MODEL_ID];
  if (models.length === 0) {
    throw new GatewayConfigError("JURISCORE_GATEWAY_MODELS lists no models.");
  }
  const unknown = models.filter((id) => !gatewayModelSpec(id));
  if (unknown.length > 0) {
    throw new GatewayConfigError(
      `JURISCORE_GATEWAY_MODELS contains models this build has no parameters for: ${unknown.join(", ")}.`,
    );
  }
  return {
    provider,
    providerLabel: PROVIDER_LABELS[provider],
    models,
    defaultModelId: models[0],
    keyConfigured: keyPresent(env),
  };
}

/** The only reader of the provider credential's value. Call it after the access gate. */
export function readProviderApiKey(env: GatewayEnv): string | null {
  return env[API_KEY_VARIABLE]?.trim() || env[LEGACY_API_KEY_VARIABLE]?.trim() || null;
}

/** Shown when the gateway is on but no key is set. Names the variable, never a value. */
export const KEY_MISSING_MESSAGE = `No proprietary LLM API key is set (${API_KEY_VARIABLE}).`;

export function processEnv(): GatewayEnv {
  const candidate = (globalThis as { process?: { env?: GatewayEnv } }).process;
  return candidate?.env ?? {};
}
