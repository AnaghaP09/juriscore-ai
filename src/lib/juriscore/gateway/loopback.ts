/**
 * Loopback host names, shared by the server (cookie and HTTPS rules) and the browser (the
 * Unlock dialog's guard). Pure data and one predicate; safe in either bundle.
 */

export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"] as const;

export function isLoopbackHostname(hostname: string) {
  return (LOOPBACK_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

/**
 * True when a page at this location must not send the unlock phrase: plain HTTP from a
 * host other than loopback. The session cookie is `Secure` off loopback, so such an unlock
 * could never work; refusing first keeps the phrase off the wire.
 */
export function unlockBlockedByLocation(location: { protocol: string; hostname: string }) {
  return location.protocol === "http:" && !isLoopbackHostname(location.hostname);
}
