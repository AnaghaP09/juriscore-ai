import { DEFAULT_GATEWAY_MODEL_ID, gatewayModelSpec } from "./models";

/**
 * Gateway configuration, read from server environment only. Nothing here is ever sent
 * to the browser except the model allowlist and yes/no facts about configuration.
 *
 * Reading is split in two so the access gate can run before any provider credential is
 * touched: `readAccessConfig` never looks at `ANTHROPIC_API_KEY`.
 */

export type GatewayEnv = Readonly<Record<string, string | undefined>>;

export class GatewayConfigError extends Error {}

/** Shorter tokens are treated as absent: the gateway stays closed rather than guessable. */
export const MIN_GATEWAY_TOKEN_LENGTH = 16;

export interface GatewayAccessConfig {
  enabled: boolean;
  token: string | null;
  killed: boolean;
}

export function readAccessConfig(env: GatewayEnv): GatewayAccessConfig {
  const token = env.JURISCORE_GATEWAY_TOKEN?.trim() ?? "";
  const kill = env.JURISCORE_GATEWAY_KILL?.trim().toLowerCase();
  return {
    enabled: env.JURISCORE_GATEWAY?.trim().toLowerCase() === "enabled",
    token: token.length >= MIN_GATEWAY_TOKEN_LENGTH ? token : null,
    killed: kill === "1" || kill === "true",
  };
}

export interface GatewayProviderConfig {
  provider: "anthropic";
  models: string[];
  defaultModelId: string;
  keyConfigured: boolean;
}

/**
 * Validates the model allowlist against the per-model parameter table. An unknown id is
 * a configuration error, never a model shown as connectable.
 */
export function readProviderConfig(env: GatewayEnv): GatewayProviderConfig {
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
    provider: "anthropic",
    models,
    defaultModelId: models[0],
    keyConfigured: Boolean(env.ANTHROPIC_API_KEY?.trim()),
  };
}

/** The only reader of the provider credential. Call it after the access gate. */
export function readProviderApiKey(env: GatewayEnv): string | null {
  return env.ANTHROPIC_API_KEY?.trim() || null;
}

export function processEnv(): GatewayEnv {
  const candidate = (globalThis as { process?: { env?: GatewayEnv } }).process;
  return candidate?.env ?? {};
}
