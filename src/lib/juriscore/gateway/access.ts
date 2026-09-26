/**
 * The gateway's access boundary (PLAN-2 decision 6). A prototype boundary for a single
 * operator on a local or stage deployment, not multi-user authentication.
 *
 * - The JurisCore gateway token is exchanged once for an HttpOnly session cookie that
 *   carries only an expiry and its HMAC. Neither the token nor any provider credential
 *   is ever returned to the browser.
 * - Every route is POST with a JSON body and must carry an `Origin` equal to the server's
 *   own, which keeps cross-site forms and simple requests out.
 *
 * Uses Web Crypto only, so it runs wherever the server runtime does.
 */

export const SESSION_COOKIE = "jc_gateway_session";
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const GATEWAY_COOKIE_PATH = "/api/gateway";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

/**
 * Constant-time token comparison. Both sides are hashed first, so the comparison runs
 * over equal-length digests whatever the submitted length.
 */
export async function tokenMatches(submitted: string, expected: string) {
  const [left, right] = await Promise.all([sha256(submitted), sha256(expected)]);
  return equalBytes(left, right);
}

/** HMAC key for session cookies. Web Crypto requires an ArrayBuffer backing. */
export type SessionSecret = Uint8Array<ArrayBuffer>;

export function createSessionSecret(): SessionSecret {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function sign(secret: SessionSecret, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export type SessionState = "valid" | "expired" | "absent" | "invalid";

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function readSession(
  request: Request,
  secret: SessionSecret,
  now: number,
): Promise<SessionState> {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return "absent";
  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return "invalid";
  const expected = await sign(secret, `session:${expiresAt}`);
  if (!equalBytes(encoder.encode(signature), encoder.encode(expected))) return "invalid";
  return Number(expiresAt) > now ? "valid" : "expired";
}

/** `Secure` is omitted only for plain-http loopback, where browsers would drop it. */
export function requiresSecureCookie(url: URL) {
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return !(url.protocol === "http:" && loopback);
}

export async function issueSessionCookie(secret: SessionSecret, now: number, url: URL) {
  const expiresAt = now + SESSION_TTL_MS;
  const signature = await sign(secret, `session:${expiresAt}`);
  const attributes = [
    `${SESSION_COOKIE}=${expiresAt}.${signature}`,
    `Path=${GATEWAY_COOKIE_PATH}`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (requiresSecureCookie(url)) attributes.push("Secure");
  return { cookie: attributes.join("; "), expiresAt: new Date(expiresAt).toISOString() };
}

/** A missing `Origin` is rejected: browsers always send one on a POST fetch. */
export function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export function isJsonRequest(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  return type.split(";")[0].trim().toLowerCase() === "application/json";
}

/** Fixed-window request counter, per process. */
export class FixedWindowLimiter {
  private windowStart = 0;
  private count = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(now: number) {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }
}

/** Caps provider calls in flight in this process. */
export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}
