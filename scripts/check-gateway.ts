import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validationReceiptSchema } from "../src/lib/juriscore/core/contracts";
import {
  UNTERMINATED_PRIVATE_KEY_DETECTOR,
  protectText,
  sanitizeForProvider,
} from "../src/lib/juriscore/veil/engine";
import { SESSION_TTL_MS } from "../src/lib/juriscore/gateway/access";
import {
  GATEWAY_ENV_VARIABLES,
  GatewayConfigError,
  readAccessConfig,
  readProviderConfig,
} from "../src/lib/juriscore/gateway/config";
import { isLoopbackHostname, unlockBlockedByLocation } from "../src/lib/juriscore/gateway/loopback";
import {
  PHRASE_ALPHABET,
  SUGGESTED_PHRASE_LENGTH,
  suggestUnlockPhrase,
} from "../src/lib/juriscore/gateway/suggest-phrase";
import {
  loadStatusAfterUnlock,
  unlockFailureMessage,
  verifyOnce,
} from "../src/lib/juriscore/gateway/session-flow";
import { GATEWAY_MODEL_TABLE } from "../src/lib/juriscore/gateway/models";
import { GatewayHttpError, createRunSequencer } from "../src/lib/juriscore/gateway/client";
import { createFakeTransport, type FakeTransport } from "../src/lib/juriscore/gateway/adapter/fake";
import {
  GATEWAY_ROUTES,
  createGatewayServer,
  type GatewayRoute,
} from "../src/lib/juriscore/gateway/server";
import { GATEWAY_PROMPT_MAX_CHARS } from "../src/lib/juriscore/gateway/protocol";

const here = dirname(fileURLToPath(import.meta.url));

// --- Fixtures ----------------------------------------------------------------------
// Synthetic key material only. The body lines are distinctive so a byte scan can prove
// none of them reached transport.
const PEM_BODY = [
  "MIIEowIBAAKCAQEAjuriscoreCANARYbodyLINEone0000000000000000000000",
  "juriscoreCANARYbodyLINEtwo1111111111111111111111111111111111111",
  "juriscoreCANARYbodyLINEthree22222222222222222222222222222222222",
];
const COMPLETE_PEM = `-----BEGIN RSA PRIVATE KEY-----\n${PEM_BODY.join("\n")}\n-----END RSA PRIVATE KEY-----`;
const UNTERMINATED_PEM = `-----BEGIN PRIVATE KEY-----\n${PEM_BODY.join("\n")}`;

const API_KEY = "sk-ant-api03-JURISCORECANARYKEYVALUE0123456789abcdefghij";
const TOKEN = "gateway-token-canary-0123456789";
const ORIGIN = "http://localhost:8080";
const SECRET_CANARY = "AKIAIOSFODNN7EXAMPLE";

// --- G.0: whole-block PEM, fail-closed unterminated key, sanitizeForProvider ---------
{
  const complete = protectText(`Deploy key:\n${COMPLETE_PEM}\nThanks.`, {
    profile: "all_sensitive",
  });
  assert.equal(complete.rawVerdict, "block");
  assert.ok(complete.sanitizedText.includes("[REDACTED_PRIVATE_KEY]"));
  for (const line of PEM_BODY) {
    assert.equal(
      complete.sanitizedText.includes(line),
      false,
      "a PEM body line survived redaction",
    );
  }
  assert.ok(complete.sanitizedText.includes("Thanks."), "text after the block is kept");
  // A block touching a letter on either side is still redacted as a whole.
  const glued = protectText(`key${COMPLETE_PEM}end`, { profile: "all_sensitive" });
  assert.equal(glued.sanitizedText, "key[REDACTED_PRIVATE_KEY]end");

  const unterminated = protectText(`Here:\n${UNTERMINATED_PEM}`, { profile: "all_sensitive" });
  assert.ok(unterminated.findings.some((f) => f.detectorId === UNTERMINATED_PRIVATE_KEY_DETECTOR));
  for (const line of PEM_BODY) assert.equal(unterminated.sanitizedText.includes(line), false);

  const passed = sanitizeForProvider(`Deploy key:\n${COMPLETE_PEM}`, { profile: "all_sensitive" });
  assert.equal(passed.blocked, false, "a complete PEM block is redacted and may proceed");
  const refused = sanitizeForProvider(UNTERMINATED_PEM, { profile: "all_sensitive" });
  assert.equal(refused.blocked, true, "an unterminated key fails closed");
  // A narrower profile leaves a detectable value in place; the residual re-scan refuses it.
  const residual = sanitizeForProvider("Patient: Maya Patel asked about billing.", {
    profile: "saas_operations",
  });
  assert.equal(residual.blocked, true, "a residual finding fails closed");
  // Verdicts are Veil's own; the gate never rewrites them (G-i).
  const clean = "Summarize our deployment checklist.";
  assert.deepEqual(sanitizeForProvider(clean).result, protectText(clean));
}

// --- Server harness ------------------------------------------------------------------
interface Harness {
  handle: (route: GatewayRoute, request: Request) => Promise<Response>;
  env: Record<string, string | undefined>;
  fake: FakeTransport;
  counts: { sanitize: number; protect: number; transports: number };
  clock: { now: number };
  keysSeen: string[];
}

function harness(envOverrides: Record<string, string | undefined> = {}, logs?: string[]): Harness {
  const env: Record<string, string | undefined> = {
    JURISCORE_GATEWAY: "enabled",
    JURISCORE_GATEWAY_TOKEN: TOKEN,
    ANTHROPIC_API_KEY: API_KEY,
    JURISCORE_GATEWAY_MODELS: "claude-opus-5,claude-sonnet-5,claude-haiku-4-5",
    ...envOverrides,
  };
  const fake = createFakeTransport();
  const counts = { sanitize: 0, protect: 0, transports: 0 };
  const clock = { now: Date.parse("2026-09-26T12:00:00.000Z") };
  const keysSeen: string[] = [];
  const server = createGatewayServer({
    env: () => env,
    now: () => clock.now,
    log: (message) => {
      logs?.push(message);
    },
    createTransport: (apiKey) => {
      counts.transports += 1;
      keysSeen.push(apiKey);
      return fake;
    },
    sanitize: (text, options) => {
      counts.sanitize += 1;
      return sanitizeForProvider(text, options);
    },
    protect: (text, options) => {
      counts.protect += 1;
      return protectText(text, options);
    },
  });
  return {
    handle: (route, request) => server.handle(route, request),
    env,
    fake,
    counts,
    clock,
    keysSeen,
  };
}

function request(
  route: GatewayRoute,
  body: unknown,
  options: {
    origin?: string | null;
    contentType?: string | null;
    cookie?: string;
    method?: string;
  } = {},
) {
  const headers = new Headers();
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  if (origin) headers.set("origin", origin);
  if (contentType) headers.set("content-type", contentType);
  if (options.cookie) headers.set("cookie", options.cookie);
  const method = options.method ?? "POST";
  return new Request(`${ORIGIN}/api/gateway/${route}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

async function unlock(h: Harness) {
  const response = await h.handle("session", request("session", { token: TOKEN }));
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "a successful unlock sets the session cookie");
  return setCookie.split(";")[0];
}

const DEFAULT_POLICY = {
  builtInIds: ["pii-baseline", "soc2-tsc", "mitre-atlas", "nist-ai-rmf"],
  custom: [],
  profile: "all_sensitive",
  strategy: "redact",
};

function promptBody(prompt: string, extra: Record<string, unknown> = {}) {
  return {
    purpose: "prompt",
    modelId: "claude-opus-5",
    policy: DEFAULT_POLICY,
    prompt,
    clientRequestId: "gw-check-1",
    ...extra,
  };
}

async function connect(h: Harness, cookie: string, modelId = "claude-opus-5") {
  const response = await h.handle("verify", request("verify", { modelId }, { cookie }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { connection: { state: string } };
  assert.equal(body.connection.state, "connected");
}

function assertNothingRan(h: Harness, label: string) {
  assert.equal(h.counts.sanitize, 0, `${label}: Veil ran before the gate rejected`);
  assert.equal(h.counts.protect, 0, `${label}: Veil ran before the gate rejected`);
  assert.equal(h.counts.transports, 0, `${label}: an adapter was built before the gate rejected`);
  assert.equal(h.fake.sent.length, 0, `${label}: something reached transport`);
  assert.equal(h.keysSeen.length, 0, `${label}: the provider key was read`);
}

// --- G-n: session ------------------------------------------------------------------
{
  const h = harness();
  const cookie = await unlock(h);
  const setCookie = (await h.handle("session", request("session", { token: TOKEN }))).headers.get(
    "set-cookie",
  )!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, /Secure/, "Secure is omitted on http://localhost only");
  assert.equal(setCookie.includes(TOKEN), false, "the cookie never carries the token");

  const bad = await h.handle("session", request("session", { token: "wrong-token-000000000" }));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("set-cookie"), null, "a bad token sets no cookie");

  // Expire the session: status, verify and run answer session-expired before any work.
  h.clock.now += SESSION_TTL_MS + 1;
  for (const route of ["status", "verify", "run"] as const) {
    const body =
      route === "status"
        ? {}
        : route === "verify"
          ? { modelId: "claude-opus-5" }
          : promptBody("hi");
    const response = await h.handle(route, request(route, body, { cookie }));
    assert.equal(response.status, 401, `${route} with an expired cookie`);
    assert.equal(((await response.json()) as { error: string }).error, "session-expired");
  }
  assertNothingRan(h, "expired session");
  // An expired cookie plus a valid token is simply renewed.
  const renewed = await h.handle("session", request("session", { token: TOKEN }, { cookie }));
  assert.equal(renewed.status, 200);
  assert.ok(renewed.headers.get("set-cookie"));

  // A Secure cookie everywhere except plain-http loopback.
  const secure = await h.handle(
    "session",
    new Request("https://gateway.example.test/api/gateway/session", {
      method: "POST",
      headers: { origin: "https://gateway.example.test", "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    }),
  );
  assert.match(secure.headers.get("set-cookie") ?? "", /Secure/);
}

// --- G-c / G-m: every rejection lands before Veil, adapter and key --------------------
{
  const cases: Array<
    [string, Record<string, string | undefined>, (h: Harness, cookie: string) => Request, number]
  > = [
    ["missing cookie", {}, () => request("run", promptBody("hi")), 401],
    [
      "forged cookie",
      {},
      () =>
        request("run", promptBody("hi"), { cookie: "jc_gateway_session=9999999999999.deadbeef" }),
      401,
    ],
    [
      "cross-origin",
      {},
      (_h, cookie) => request("run", promptBody("hi"), { cookie, origin: "https://evil.example" }),
      403,
    ],
    [
      "missing origin",
      {},
      (_h, cookie) => request("run", promptBody("hi"), { cookie, origin: null }),
      403,
    ],
    [
      "non-JSON",
      {},
      (_h, cookie) => request("run", promptBody("hi"), { cookie, contentType: "text/plain" }),
      415,
    ],
    ["GET", {}, (_h, cookie) => request("run", null, { cookie, method: "GET" }), 405],
    [
      "kill switch",
      { JURISCORE_GATEWAY_KILL: "1" },
      (_h, cookie) => request("run", promptBody("hi"), { cookie }),
      503,
    ],
  ];
  for (const [label, overrides, make, expected] of cases) {
    const h = harness(overrides);
    const cookie = await unlock(h);
    const response = await h.handle("run", make(h, cookie));
    assert.equal(response.status, expected, label);
    if (expected === 405) assert.equal(response.headers.get("allow"), "POST");
    assertNothingRan(h, label);
  }

  // PLAN-5: a key alone turns the gateway on, so "off" is now the explicit switch.
  const disabled = harness({ JURISCORE_GATEWAY: "disabled" });
  for (const route of GATEWAY_ROUTES) {
    assert.equal(
      (await disabled.handle(route, request(route, {}))).status,
      404,
      `disabled ${route}`,
    );
  }
  assertNothingRan(disabled, "disabled");

  const tokenless = harness({ JURISCORE_GATEWAY_TOKEN: undefined });
  assert.equal((await tokenless.handle("session", request("session", { token: "x" }))).status, 503);
  const shortToken = harness({ JURISCORE_GATEWAY_TOKEN: "short" });
  assert.equal((await shortToken.handle("status", request("status", {}))).status, 503);
  assertNothingRan(tokenless, "enabled without a token");

  const limited = harness();
  const cookie = await unlock(limited);
  let lastStatus = 0;
  for (let index = 0; index < 31; index += 1) {
    lastStatus = (
      await limited.handle(
        "run",
        request("run", promptBody("hi", { modelId: "not-allowed" }), { cookie }),
      )
    ).status;
  }
  assert.equal(lastStatus, 429, "over the fixed-window limit");
  assertNothingRan(limited, "rate limited");
}

// --- G-a / G-b: status and verify ----------------------------------------------------
{
  const h = harness();
  const cookie = await unlock(h);
  const statusResponse = await h.handle("status", request("status", {}, { cookie }));
  const statusText = await statusResponse.text();
  for (const secret of ["sk-ant", API_KEY, API_KEY.slice(0, 12), TOKEN]) {
    assert.equal(statusText.includes(secret), false, "status leaked key material");
  }
  const status = JSON.parse(statusText) as {
    configured: boolean;
    models: string[];
    connections: Record<string, { state: string }>;
  };
  assert.equal(status.configured, true);
  assert.deepEqual(status.models, ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]);
  for (const id of status.models) assert.equal(status.connections[id].state, "not_connected");

  const reasons: Array<[Parameters<FakeTransport["verifyOutcome"]["set"]>[1], string]> = [
    ["authentication", "API key rejected"],
    ["permission", "Key lacks access to this model"],
    ["not_found", "Model not available to this account"],
    ["rate_limit", "Rate limited, try again"],
    ["connection", "Provider unreachable"],
    ["server", "Check failed (status 529)"],
  ];
  for (const [failure, reason] of reasons) {
    h.fake.verifyOutcome.set("claude-opus-5", failure);
    const response = await h.handle(
      "verify",
      request("verify", { modelId: "claude-opus-5" }, { cookie }),
    );
    const body = (await response.json()) as { connection: { state: string; error?: string } };
    assert.equal(body.connection.state, "failed", failure);
    assert.equal(body.connection.error, reason, failure);
    // A failed model cannot be used.
    const run = await h.handle("run", request("run", promptBody("hi"), { cookie }));
    assert.equal(run.status, 409);
  }
  h.fake.verifyOutcome.set("claude-opus-5", "ok");
  await connect(h, cookie);
  const after = (await (await h.handle("status", request("status", {}, { cookie }))).json()) as {
    connections: Record<string, { state: string; lastVerifiedAt: string | null }>;
  };
  assert.equal(after.connections["claude-opus-5"].state, "connected");
  assert.ok(after.connections["claude-opus-5"].lastVerifiedAt);
  // Switching model shows that model's own state: never inherited.
  assert.equal(after.connections["claude-sonnet-5"].state, "not_connected");
  assert.equal(
    h.keysSeen.every((key) => key === API_KEY),
    true,
  );

  const notAllowed = await h.handle("verify", request("verify", { modelId: "gpt-4o" }, { cookie }));
  assert.equal(notAllowed.status, 400);
}

// --- G-l: per-model parameters; unknown ids fail config validation -------------------
{
  const h = harness();
  const cookie = await unlock(h);
  for (const modelId of Object.keys(GATEWAY_MODEL_TABLE)) {
    await connect(h, cookie, modelId);
    const before = h.fake.sent.length;
    const response = await h.handle(
      "run",
      request("run", promptBody("Say hello.", { modelId }), { cookie }),
    );
    assert.equal(response.status, 200, modelId);
    const sent = h.fake.sent[before];
    const spec = GATEWAY_MODEL_TABLE[modelId];
    assert.equal(sent.model, modelId);
    assert.deepEqual(sent.thinking, spec.thinking ?? undefined, `${modelId} thinking`);
    assert.deepEqual(sent.output_config, spec.effort ? { effort: spec.effort.prompt } : undefined);
    assert.equal(sent.fallbacks, spec.fallbacks ?? undefined, `${modelId} fallbacks`);
    assert.deepEqual(sent.betas, spec.fallbacks ? ["server-side-fallback-2026-07-01"] : undefined);
  }
  const haiku = h.fake.sent.find((payload) => payload.model === "claude-haiku-4-5")!;
  assert.equal("thinking" in haiku, false, "Haiku 4.5 carries no thinking parameter");
  assert.equal("output_config" in haiku, false, "Haiku 4.5 carries no effort");
  const opus = h.fake.sent.find((payload) => payload.model === "claude-opus-5")!;
  assert.deepEqual(opus.thinking, { type: "adaptive" });
  assert.deepEqual(opus.output_config, { effort: "high" });

  assert.throws(
    () => readProviderConfig({ JURISCORE_GATEWAY_MODELS: "claude-opus-5,claude-imaginary-9" }),
    GatewayConfigError,
  );
  assert.deepEqual(readProviderConfig({}).models, ["claude-opus-5"]);
  const misconfigured = harness({ JURISCORE_GATEWAY_MODELS: "claude-imaginary-9" });
  const misCookie = await unlock(misconfigured);
  const misStatus = (await (
    await misconfigured.handle("status", request("status", {}, { cookie: misCookie }))
  ).json()) as {
    configured: boolean;
    models: string[];
  };
  assert.equal(misStatus.configured, false, "an unknown model id never reads as configured");
  assert.deepEqual(misStatus.models, []);
  assert.equal(
    (
      await misconfigured.handle(
        "verify",
        request("verify", { modelId: "claude-imaginary-9" }, { cookie: misCookie }),
      )
    ).status,
    503,
  );
}

// --- G-d / G-o-style: Veil before every adapter call ---------------------------------
{
  const h = harness();
  const cookie = await unlock(h);
  await connect(h, cookie);

  const withKey = await h.handle(
    "run",
    request("run", promptBody(`Rotate this:\n${COMPLETE_PEM}`), { cookie }),
  );
  const withKeyBody = (await withKey.json()) as { run: { status: string } };
  assert.equal(withKeyBody.run.status, "ok", "a complete PEM block is redacted and sent");
  const payload = JSON.stringify(h.fake.sent.at(-1));
  assert.ok(payload.includes("[REDACTED_PRIVATE_KEY]"));
  for (const line of PEM_BODY)
    assert.equal(payload.includes(line), false, "key body reached transport");
  assert.equal(payload.includes("BEGIN RSA PRIVATE KEY"), false);

  const sentBefore = h.fake.sent.length;
  const cut = await h.handle(
    "run",
    request("run", promptBody(`Rotate this:\n${UNTERMINATED_PEM}`), { cookie }),
  );
  const cutBody = (await cut.json()) as {
    run: { status: string; outboundDigest: string | null };
    receipt: unknown;
  };
  assert.equal(cutBody.run.status, "blocked");
  assert.equal(cutBody.run.outboundDigest, null);
  assert.equal(h.fake.sent.length, sentBefore, "an unterminated key never reaches the adapter");
  assert.equal(validationReceiptSchema.parse(cutBody.receipt).verdict, "block");

  const residual = await h.handle(
    "run",
    request(
      "run",
      promptBody("Patient: Maya Patel asked about billing.", {
        policy: { ...DEFAULT_POLICY, profile: "saas_operations", builtInIds: ["pii-baseline"] },
      }),
      { cookie },
    ),
  );
  assert.equal(((await residual.json()) as { run: { status: string } }).run.status, "blocked");
  assert.equal(h.fake.sent.length, sentBefore, "a residual finding never reaches the adapter");

  // A credential is redacted before transport, and the request digest is over the original.
  const leaky = await h.handle(
    "run",
    request("run", promptBody(`Use ${SECRET_CANARY} for the job.`), { cookie }),
  );
  const leakyBody = (await leaky.json()) as { run: { status: string; requestDigest: string } };
  assert.equal(leakyBody.run.status, "ok");
  assert.equal(JSON.stringify(h.fake.sent.at(-1)).includes(SECRET_CANARY), false);
  assert.ok(JSON.stringify(h.fake.sent.at(-1)).includes("[REDACTED_AWS_KEY]"));
}

// --- G-e: refusal and truncation ----------------------------------------------------
{
  const h = harness();
  const cookie = await unlock(h);
  await connect(h, cookie);
  h.fake.replies = [{ kind: "refusal", category: "cyber" }];
  const declined = (await (
    await h.handle("run", request("run", promptBody("hi"), { cookie }))
  ).json()) as {
    run: { status: string; declineCategory: string | null };
    display: { output: string | null };
  };
  assert.equal(declined.run.status, "declined");
  assert.equal(declined.run.declineCategory, "cyber");
  assert.equal(declined.display.output, null);

  h.fake.replies = [{ kind: "text", text: "Partial answer", stopReason: "max_tokens" }];
  const truncated = (await (
    await h.handle("run", request("run", promptBody("hi"), { cookie }))
  ).json()) as {
    run: { status: string };
  };
  assert.equal(truncated.run.status, "truncated");

  // A provider failure mid-run is reported, not dressed up as an answer; an auth failure
  // also drops the model out of "connected".
  h.fake.replies = [{ kind: "failure", failure: "authentication" }];
  const failed = await h.handle("run", request("run", promptBody("hi"), { cookie }));
  assert.equal(failed.status, 502);
  const status = (await (await h.handle("status", request("status", {}, { cookie }))).json()) as {
    connections: Record<string, { state: string }>;
  };
  assert.equal(status.connections["claude-opus-5"].state, "failed");

  // The reply is checked by Veil on the way back.
  await connect(h, cookie);
  h.fake.replies = [{ kind: "text", text: `Sure, the key is ${SECRET_CANARY}.` }];
  const leakyReply = (await (
    await h.handle("run", request("run", promptBody("hi"), { cookie }))
  ).json()) as {
    run: { outputCheck: { rawVerdict: string } };
    display: { output: string };
  };
  assert.equal(leakyReply.run.outputCheck.rawVerdict, "block");
  assert.equal(leakyReply.display.output.includes(SECRET_CANARY), false);
}

// --- G-k: request schemas -----------------------------------------------------------
{
  const h = harness();
  const cookie = await unlock(h);
  await connect(h, cookie);
  const missing = await h.handle(
    "run",
    request(
      "run",
      { purpose: "prompt", modelId: "claude-opus-5", policy: DEFAULT_POLICY, clientRequestId: "x" },
      { cookie },
    ),
  );
  assert.equal(missing.status, 400);
  const oversized = await h.handle(
    "run",
    request("run", promptBody("x".repeat(GATEWAY_PROMPT_MAX_CHARS + 1)), { cookie }),
  );
  assert.equal(oversized.status, 413);
  assert.equal(((await oversized.json()) as { field: string }).field, "prompt");
  const extraField = await h.handle(
    "run",
    request("run", promptBody("hi", { rawInput: "x" }), { cookie }),
  );
  assert.equal(extraField.status, 400, "unknown request fields are rejected");
  const prediction = await h.handle(
    "run",
    request("run", { purpose: "drift-risk", modelId: "claude-opus-5" }, { cookie }),
  );
  assert.equal(prediction.status, 400);
  assert.equal(((await prediction.json()) as { error: string }).error, "purpose-not-available");
  const unknownPolicy = await h.handle(
    "run",
    request("run", promptBody("hi", { policy: { ...DEFAULT_POLICY, builtInIds: ["made-up"] } }), {
      cookie,
    }),
  );
  assert.equal(unknownPolicy.status, 400);
  assert.equal(h.counts.sanitize, 0, "schema failures are rejected before Veil");
  assert.equal(h.fake.sent.length, 0);

  // A custom policy applies to its own request only, and nothing is kept server-side.
  const healthcarePolicy = {
    id: "custom-health.1",
    name: "Clinic intake",
    shortName: "Clinic intake",
    version: "1.0",
    authority: "Your organization",
    description: "",
    features: ["veil", "plumb"],
    veilScopes: ["common", "healthcare"],
    defaultActive: true,
    custom: true,
    source: {
      title: "Clinic intake",
      publisher: "Your organization",
      url: "about:blank",
      retrievedAt: "2026-09-26",
    },
  };
  const narrow = { ...DEFAULT_POLICY, profile: "saas_operations", builtInIds: ["pii-baseline"] };
  const text = "Patient: Maya Patel asked about billing.";
  const withCustom = (await (
    await h.handle(
      "run",
      request("run", promptBody(text, { policy: { ...narrow, custom: [healthcarePolicy] } }), {
        cookie,
      }),
    )
  ).json()) as {
    run: { status: string; inputCheck: { findings: { category: string }[] } };
  };
  assert.equal(withCustom.run.status, "ok");
  assert.ok(withCustom.run.inputCheck.findings.some((f) => f.category === "patient_name"));
  const without = (await (
    await h.handle("run", request("run", promptBody(text, { policy: narrow }), { cookie }))
  ).json()) as {
    run: { status: string; inputCheck: { findings: { category: string }[] } };
  };
  assert.equal(
    without.run.inputCheck.findings.some((f) => f.category === "patient_name"),
    false,
  );
  assert.equal(without.run.status, "blocked", "without the pack the name is residual and refused");
}

// --- G-g / G-p: prompt round-trip, receipt, stale guard ------------------------------
{
  const h = harness();
  const cookie = await unlock(h);
  await connect(h, cookie);
  const CANARY = "juriscore-canary-prompt-7f3a";
  const response = await h.handle(
    "run",
    request("run", promptBody(`Explain ${CANARY} and email ops@example.test`), { cookie }),
  );
  assert.equal(response.status, 200);
  const text = await response.text();
  const body = JSON.parse(text) as {
    run: {
      status: string;
      clientRequestId: string;
      requestDigest: string;
      outboundDigest: string;
      usage: { inputTokens: number };
    };
    display: { output: string };
    receipt: unknown;
    envelope?: unknown;
  };
  assert.equal(body.run.status, "ok");
  assert.equal(body.run.clientRequestId, "gw-check-1");
  assert.equal(body.display.output, "A deterministic reply from the fake provider.");
  assert.equal(body.run.usage.inputTokens, 42);
  assert.equal("envelope" in body, false, "a prompt run has no prediction envelope");
  const receipt = validationReceiptSchema.parse(body.receipt);
  assert.equal(receipt.module, "gateway");
  assert.equal(receipt.digestVersion, "gateway.request.v1");
  assert.equal(receipt.inputDigest, body.run.requestDigest);
  assert.equal(receipt.outboundDigest, body.run.outboundDigest);
  assert.equal(receipt.verdict, "revise", "the raw prompt carried an email address");
  const receiptText = JSON.stringify(receipt);
  for (const value of [CANARY, "ops@example.test", "Explain"]) {
    assert.equal(receiptText.includes(value), false, "the receipt carried prompt text");
  }
  // The server returns the prompt's findings as labels and counts, never the prompt.
  assert.equal(text.includes(CANARY), false, "the run response echoed the prompt");
  assert.equal(text.includes("ops@example.test"), false);

  // Same prompt, same policy, same model: same request digest. Different model: different.
  const again = (await (
    await h.handle(
      "run",
      request("run", promptBody(`Explain ${CANARY} and email ops@example.test`), { cookie }),
    )
  ).json()) as { run: { requestDigest: string } };
  assert.equal(again.run.requestDigest, body.run.requestDigest);

  const sequencer = createRunSequencer("check");
  const older = sequencer.next();
  const newer = sequencer.next();
  assert.equal(sequencer.isCurrent(older), false, "an out-of-order older response is discarded");
  assert.equal(sequencer.isCurrent(newer), true);
}

// --- G-f: no simulation left on the gateway page ------------------------------------
{
  const page = readFileSync(resolve(here, "../src/routes/dashboard.gateway.tsx"), "utf8");
  assert.equal(page.includes("Math.random"), false, "the gateway page must not invent numbers");
  assert.equal(page.includes("scanPrompt"), false, "the gateway page uses the Veil engine");
  const store = readFileSync(resolve(here, "../src/lib/juriscore/demo-store.tsx"), "utf8");
  assert.equal(/export const MODELS\b/.test(store), false, "the stale model list is gone");
}

// --- G-m: methods, straight through each route file's own handlers -----------------
// TanStack Start answers a method that has neither its own handler nor `ANY` with the app
// shell, so every gateway route declares `ANY`. This check runs the route files' handler
// tables directly. Framework-level routing was verified on a real dev server
// (GET/PUT/DELETE -> 405 Allow: POST; no Origin -> 403; disabled -> 404); Bun cannot load
// TanStack Start's generated entries without the Vite plugin, so it is not repeated here.
{
  const saved = {
    JURISCORE_GATEWAY: process.env.JURISCORE_GATEWAY,
    JURISCORE_GATEWAY_TOKEN: process.env.JURISCORE_GATEWAY_TOKEN,
  };
  process.env.JURISCORE_GATEWAY = "enabled";
  process.env.JURISCORE_GATEWAY_TOKEN = TOKEN;
  try {
    for (const route of GATEWAY_ROUTES) {
      const module = (await import(`../src/routes/api/gateway/${route}.ts`)) as {
        Route: { options: { server: { handlers: Record<string, unknown> } } };
      };
      const handlers = module.Route.options.server.handlers as Record<
        string,
        (context: { request: Request }) => Promise<Response> | Response
      >;
      assert.equal(typeof handlers.POST, "function", `${route} handles POST`);
      assert.equal(typeof handlers.ANY, "function", `${route} declares ANY for other methods`);
      assert.equal(handlers.GET, undefined, `${route} has no GET handler`);
      for (const method of ["GET", "PUT", "DELETE"]) {
        const response = await handlers.ANY({ request: request(route, {}, { method }) });
        assert.equal(response.status, 405, `${method} /api/gateway/${route}`);
        assert.equal(response.headers.get("allow"), "POST");
      }
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// --- PLAN-5: guided setup — enable rule, agnostic key, phrase, flow, env example -------
{
  // Enable rule: a key alone turns the gateway on; "disabled" wins; nothing → off.
  const keyOnly = harness({ JURISCORE_GATEWAY: undefined });
  assert.equal((await keyOnly.handle("status", request("status", {}))).status, 401, "key alone: on");
  const disabledWithKey = harness({ JURISCORE_GATEWAY: "disabled" });
  assert.equal((await disabledWithKey.handle("status", request("status", {}))).status, 404);
  assertNothingRan(disabledWithKey, "disabled with key");
  const nothing = harness({ JURISCORE_GATEWAY: undefined, ANTHROPIC_API_KEY: undefined });
  assert.equal((await nothing.handle("status", request("status", {}))).status, 404);
  assert.equal(readAccessConfig({ JURISCORE_GATEWAY: "enabled" }).enabled, true);
  assert.equal(readAccessConfig({}).enabled, false);

  // Agnostic key name first, legacy name as fallback; the value reaches the adapter intact.
  const newName = harness({ ANTHROPIC_API_KEY: undefined, JURISCORE_LLM_API_KEY: API_KEY });
  await connect(newName, await unlock(newName));
  assert.deepEqual(newName.keysSeen, [API_KEY]);
  const both = harness({ JURISCORE_LLM_API_KEY: API_KEY, ANTHROPIC_API_KEY: "sk-ant-legacy-00000000000" });
  await connect(both, await unlock(both));
  assert.deepEqual(both.keysSeen, [API_KEY], "the new name wins over the legacy name");

  // Provider: default anthropic; anything else is a configuration error, never connectable.
  assert.equal(readProviderConfig({}).provider, "anthropic");
  assert.equal(readProviderConfig({}).providerLabel, "Anthropic");
  assert.throws(() => readProviderConfig({ JURISCORE_LLM_PROVIDER: "openai" }), GatewayConfigError);
  const badProvider = harness({ JURISCORE_LLM_PROVIDER: "openai" });
  const badCookie = await unlock(badProvider);
  const badStatus = (await (
    await badProvider.handle("status", request("status", {}, { cookie: badCookie }))
  ).json()) as { configured: boolean; configError?: string; models: string[] };
  assert.equal(badStatus.configured, false);
  assert.ok(badStatus.configError?.includes("openai"));
  assert.deepEqual(badStatus.models, []);
  assert.equal(
    (await badProvider.handle("verify", request("verify", { modelId: "claude-opus-5" }, { cookie: badCookie }))).status,
    503,
  );
  assertNothingRan(badProvider, "unknown provider");

  // A phrase equal to the API key is ignored, once, with one log line; the old value is refused.
  const logs: string[] = [];
  const same = harness({ JURISCORE_GATEWAY_TOKEN: API_KEY }, logs);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await same.handle("session", request("session", { token: API_KEY }));
    assert.equal(response.status, 503, "a phrase equal to the key is treated as absent");
    assert.equal(((await response.json()) as { error: string }).error, "gateway-token-missing");
  }
  assert.equal(logs.filter((line) => line.includes("equals the LLM API key")).length, 1);
  assertNothingRan(same, "token equals key");

  // Remote plain HTTP: the session route refuses before reading the phrase; HTTPS proceeds.
  const remote = harness();
  const remoteRequest = (url: string, origin: string) =>
    new Request(url, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    });
  const refused = await remote.handle(
    "session",
    remoteRequest("http://192.168.1.5:8080/api/gateway/session", "http://192.168.1.5:8080"),
  );
  assert.equal(refused.status, 400);
  assert.equal(((await refused.json()) as { error: string }).error, "https-required");
  assert.equal(refused.headers.get("set-cookie"), null);
  const secure = await remote.handle(
    "session",
    remoteRequest("https://gateway.example/api/gateway/session", "https://gateway.example"),
  );
  assert.equal(secure.status, 200, "HTTPS from another host is allowed");
  assert.ok(secure.headers.get("set-cookie")?.includes("Secure"));
  assertNothingRan(remote, "remote session attempts");

  // No route body, on any status, ever contains the phrase or the key.
  const bodies = harness();
  const bodyCookie = await unlock(bodies);
  const noKey = harness({ ANTHROPIC_API_KEY: undefined, JURISCORE_GATEWAY: "enabled" });
  const noKeyCookie = await unlock(noKey);
  const responses = await Promise.all([
    bodies.handle("status", request("status", {})),
    bodies.handle("session", request("session", { token: "wrong-phrase-0123456789" })),
    bodies.handle("status", request("status", {}, { cookie: bodyCookie })),
    bodies.handle("verify", request("verify", { modelId: "claude-opus-5" }, { cookie: bodyCookie })),
    noKey.handle("status", request("status", {}, { cookie: noKeyCookie })),
    noKey.handle("verify", request("verify", { modelId: "claude-opus-5" }, { cookie: noKeyCookie })),
    same.handle("session", request("session", { token: API_KEY })),
  ]);
  for (const response of responses) {
    const text = await response.text();
    assert.equal(text.includes(TOKEN), false, `phrase leaked in a ${response.status} body`);
    assert.equal(text.includes(API_KEY), false, `key leaked in a ${response.status} body`);
    assert.equal(text.includes("sk-ant-legacy"), false, "legacy key leaked");
  }

  // Suggested phrase: length, alphabet, randomness, unbiased rejection sampling.
  const phrase = suggestUnlockPhrase();
  assert.equal(phrase.length, SUGGESTED_PHRASE_LENGTH);
  assert.ok(new RegExp(`^[${PHRASE_ALPHABET}]+$`).test(phrase), "phrase uses the alphabet only");
  assert.notEqual(phrase, suggestUnlockPhrase(), "two draws differ");
  let counter = 250; // starts in the rejected range so sampling must skip bytes
  const sequential = suggestUnlockPhrase((buffer) => {
    for (let index = 0; index < buffer.length; index += 1) buffer[index] = counter++ % 256;
    return buffer;
  });
  assert.equal(sequential.length, SUGGESTED_PHRASE_LENGTH);
  assert.equal(sequential[0], PHRASE_ALPHABET[0], "bytes at or above the limit are skipped");
  assert.ok(SUGGESTED_PHRASE_LENGTH >= 20);

  // Browser guard: plain HTTP off loopback blocks the Unlock dialog before any request.
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(unlockBlockedByLocation({ protocol: "http:", hostname }), false, hostname);
  }
  assert.equal(unlockBlockedByLocation({ protocol: "http:", hostname: "192.168.1.5" }), true);
  assert.equal(unlockBlockedByLocation({ protocol: "http:", hostname: "laptop.local" }), true);
  assert.equal(unlockBlockedByLocation({ protocol: "https:", hostname: "gateway.example" }), false);
  assert.equal(isLoopbackHostname("LOCALHOST"), true);

  // Unlock flow, driven without React: status then one automatic verify.
  const okStatus = {
    enabled: true as const,
    configured: true,
    provider: "anthropic" as const,
    providerLabel: "Anthropic",
    models: ["claude-opus-5", "claude-sonnet-5"],
    defaultModelId: "claude-opus-5",
    connections: {
      "claude-opus-5": { state: "not_connected" as const, lastVerifiedAt: null },
      "claude-sonnet-5": { state: "connected" as const, lastVerifiedAt: "2026-09-30T00:00:00.000Z" },
    },
  };
  const connected = { state: "connected" as const, lastVerifiedAt: "2026-09-30T00:00:01.000Z" };
  const flowClient = (statusImpl: () => Promise<typeof okStatus>, verifyImpl?: (id: string) => Promise<unknown>) => {
    const calls = { status: 0, verify: [] as string[] };
    return {
      calls,
      client: {
        status: () => {
          calls.status += 1;
          return statusImpl();
        },
        verify: async (modelId: string) => {
          calls.verify.push(modelId);
          if (verifyImpl) return (await verifyImpl(modelId)) as never;
          return { modelId, connection: connected };
        },
      },
    };
  };
  {
    const { client, calls } = flowClient(async () => okStatus);
    const outcome = await loadStatusAfterUnlock(client);
    assert.equal(outcome.kind, "ready");
    assert.deepEqual(calls, { status: 1, verify: ["claude-opus-5"] });
    if (outcome.kind === "ready") {
      assert.equal(outcome.status.connections["claude-opus-5"].state, "connected");
      assert.ok(outcome.verified);
    }
  }
  {
    const { client, calls } = flowClient(async () => okStatus);
    const outcome = await loadStatusAfterUnlock(client, "claude-sonnet-5");
    assert.equal(outcome.kind, "ready");
    assert.deepEqual(calls.verify, ["claude-sonnet-5"], "a cached connected state is re-verified once");
  }
  {
    const { client, calls } = flowClient(async () => {
      throw new GatewayHttpError(401, "session-required");
    });
    const outcome = await loadStatusAfterUnlock(client);
    assert.deepEqual(outcome, { kind: "locked", expired: false });
    assert.deepEqual(calls.verify, [], "no verify after a rejected status");
  }
  {
    const { client, calls } = flowClient(async () => {
      throw new TypeError("Failed to fetch");
    });
    const outcome = await loadStatusAfterUnlock(client);
    assert.equal(outcome.kind, "status-unknown");
    assert.deepEqual(calls.verify, []);
    // Retry is the same call again; when the network is back it completes with one verify.
    const retry = flowClient(async () => okStatus);
    assert.equal((await loadStatusAfterUnlock(retry.client)).kind, "ready");
    assert.deepEqual(retry.calls, { status: 1, verify: ["claude-opus-5"] });
  }
  {
    const busy = flowClient(async () => okStatus, async () => {
      throw new GatewayHttpError(429, "busy", "Too many provider calls in flight.");
    });
    const outcome = await loadStatusAfterUnlock(busy.client);
    assert.equal(outcome.kind, "ready", "a busy verify keeps the unlocked state");
    if (outcome.kind === "ready") {
      const connection = outcome.status.connections["claude-opus-5"];
      assert.equal(connection.state, "failed");
      assert.ok(connection.state === "failed" && connection.error?.includes("busy"));
    }
    const network = flowClient(async () => okStatus, async () => {
      throw new TypeError("Failed to fetch");
    });
    const again = await verifyOnce(network.client, "claude-opus-5");
    assert.equal(again.kind, "recoverable");
    const recovered = await verifyOnce(flowClient(async () => okStatus).client, "claude-opus-5");
    assert.equal(recovered.kind, "verified");
    const lost = await verifyOnce(
      flowClient(async () => okStatus, async () => {
        throw new GatewayHttpError(401, "session-expired");
      }).client,
      "claude-opus-5",
    );
    assert.deepEqual(lost, { kind: "locked", expired: true });
  }
  assert.ok(unlockFailureMessage(new GatewayHttpError(401, "token-rejected")).includes("does not match"));
  assert.ok(unlockFailureMessage(new GatewayHttpError(400, "https-required")).includes("localhost"));

  // .env.example carries the instructions and every variable the server reads.
  const example = readFileSync(resolve(here, "../.env.example"), "utf8");
  const assignments = new Map(
    example
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).trim()] as const;
      }),
  );
  for (const name of GATEWAY_ENV_VARIABLES) {
    assert.ok(assignments.has(name), `.env.example lists ${name}`);
  }
  for (const [name, value] of assignments) {
    if (name === "JURISCORE_GATEWAY") assert.equal(value, "enabled");
    else assert.equal(value, "", `.env.example must not fill in ${name}`);
  }
  for (const phraseNeeded of [".env.local", "docs/GATEWAY_SETUP.md", "already exists", "Do not overwrite"]) {
    assert.ok(example.includes(phraseNeeded), `.env.example mentions "${phraseNeeded}"`);
  }
  assert.equal(example.includes("sk-"), false, "no key-shaped value in the example");
}

console.log("JurisCore gateway checks passed.");
