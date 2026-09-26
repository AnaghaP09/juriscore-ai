import type { PersistedReceipt } from "./contracts";
import { receiptDigestVersion, sha256Hex } from "./receipts";
import {
  plumbClaimsCanonical,
  plumbClaimsFromSources,
  plumbSourceDigests,
  type PlumbSourceText,
} from "../plumb/receipt";

/**
 * Re-checks a receipt against material the user supplies again. Everything here is pure:
 * the supplied text is hashed and dropped, and nothing is written to any store.
 */

export type VerificationMode =
  | { kind: "veil-text" }
  | { kind: "plumb-sources" }
  | { kind: "unavailable"; reason: string };

export type DigestMatch = "matches" | "differs";

export function verificationMode(receipt: PersistedReceipt): VerificationMode {
  switch (receiptDigestVersion(receipt)) {
    case "veil.raw-text.v1":
      return { kind: "veil-text" };
    case "plumb.sources.v2":
      return receipt.sourceDigest
        ? { kind: "plumb-sources" }
        : {
            kind: "unavailable",
            reason: "This Plumb receipt names the v2 digest but carries no source digest.",
          };
    case "plumb.claims.v1":
      return {
        kind: "unavailable",
        reason:
          "This receipt was made before sources were digested by content. Its digest includes the times the diff and documents were loaded, which cannot be reconstructed, so pasting the text again cannot reproduce it.",
      };
    case "gateway.request.v1":
      return {
        kind: "unavailable",
        reason:
          "Gateway receipts are re-checked by re-running the same request through the gateway.",
      };
  }
}

export async function verifyVeilText(
  receipt: PersistedReceipt,
  originalInput: string,
): Promise<DigestMatch> {
  return (await sha256Hex(originalInput)) === receipt.inputDigest ? "matches" : "differs";
}

export interface PlumbVerification {
  /** Whether the diff and documents are byte-for-byte the ones checked. */
  source: DigestMatch;
  /** Whether the claims extracted from them are the ones compared. */
  claims: DigestMatch;
}

export async function verifyPlumbSources(
  receipt: PersistedReceipt,
  sources: PlumbSourceText,
): Promise<PlumbVerification> {
  const { sourceDigest } = await plumbSourceDigests(sources);
  const claimsDigest = await sha256Hex(plumbClaimsCanonical(plumbClaimsFromSources(sources)));
  return {
    source: sourceDigest === receipt.sourceDigest ? "matches" : "differs",
    claims: claimsDigest === receipt.inputDigest ? "matches" : "differs",
  };
}
