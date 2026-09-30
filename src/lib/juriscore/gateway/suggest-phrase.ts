/**
 * Suggests an unlock phrase for the Set up gateway dialog. Browser-only convenience: the
 * phrase protects nothing until the operator writes it into the server's configuration as
 * `JURISCORE_GATEWAY_TOKEN`, so showing it on screen gives nothing away. The server never
 * generates, prints or stores a phrase.
 */

/** Letters and digits that are hard to misread; no `0/O`, `1/l/I`. URL-safe. */
export const PHRASE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SUGGESTED_PHRASE_LENGTH = 24;

export type RandomBytes = (buffer: Uint8Array) => Uint8Array;

const defaultRandom: RandomBytes = (buffer) => crypto.getRandomValues(buffer);

/** Unbiased sampling: bytes at or above the largest multiple of the alphabet are rejected. */
export function suggestUnlockPhrase(random: RandomBytes = defaultRandom) {
  const size = PHRASE_ALPHABET.length;
  const limit = 256 - (256 % size);
  const out: string[] = [];
  const buffer = new Uint8Array(64);
  while (out.length < SUGGESTED_PHRASE_LENGTH) {
    random(buffer);
    for (const byte of buffer) {
      if (byte >= limit) continue;
      out.push(PHRASE_ALPHABET[byte % size]);
      if (out.length === SUGGESTED_PHRASE_LENGTH) break;
    }
  }
  return out.join("");
}
