import {
  persistedReceiptSchema,
  validationReceiptSchema,
  type DigestVersion,
  type EvidenceReference,
  type PersistedReceipt,
  type ValidationModule,
  type ValidationReceipt,
  type ValidatorVerdict,
} from "./contracts";

export interface ReceiptPolicyRef {
  id: string;
  version: string;
}

export interface ReceiptRunInput {
  module: ValidationModule;
  /** The text `inputDigest` is computed over; what it is depends on `digestVersion`. */
  rawInput: string;
  digestVersion: DigestVersion;
  verdict: ValidatorVerdict;
  findingIds: string[];
  evidence: EvidenceReference[];
  policies: ReceiptPolicyRef[];
  sourceDigest?: string;
  createdAt?: string;
}

export class ReceiptError extends Error {}

// Custom policies are user-named, so the encoding delimiters are sanitized out of
// each part before joining.
function sanitizePolicyPart(part: string) {
  return part.replace(/[@;]+/g, "-").trim();
}

// Canonical V1 encoding while the schema field is a single string: sorted by id so
// identical active sets always produce byte-identical strings. Promotion to a
// structured array is deferred to the receipt-store slice.
export function encodePolicyVersion(policies: ReceiptPolicyRef[]) {
  if (policies.length === 0) return "none";
  return [...policies]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((policy) => `${sanitizePolicyPart(policy.id)}@${sanitizePolicyPart(policy.version)}`)
    .join("; ");
}

/** A policy id as it appears inside an encoded `policyVersion`. */
export function encodedPolicyId(id: string) {
  return sanitizePolicyPart(id);
}

/** Reads `id@version; …` back into its parts. `none` and an empty string decode to []. */
export function decodePolicyVersion(policyVersion: string): ReceiptPolicyRef[] {
  const trimmed = policyVersion.trim();
  if (!trimmed || trimmed === "none") return [];
  return trimmed
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      // Encoded parts cannot contain "@", so the first one separates id from version.
      const at = part.indexOf("@");
      return at < 0
        ? { id: part, version: "" }
        : { id: part.slice(0, at).trim(), version: part.slice(at + 1).trim() };
    });
}

export async function sha256Hex(text: string) {
  if (!globalThis.crypto?.subtle) {
    throw new ReceiptError("A secure context is required to digest the input for a receipt.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 64 random bits as hex, so runs created in the same millisecond never share an id. */
function receiptNonce() {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createReceipt(input: ReceiptRunInput): Promise<ValidationReceipt> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const inputDigest = await sha256Hex(input.rawInput);
  return validationReceiptSchema.parse({
    // Module, time, and input digest keep ids readable; the nonce keeps every run's id
    // unique, including identical runs in the same millisecond or in other tabs.
    id: `receipt.${input.module}.${createdAt}.${inputDigest.slice(0, 8)}.${receiptNonce()}`,
    module: input.module,
    policyVersion: encodePolicyVersion(input.policies),
    inputDigest,
    verdict: input.verdict,
    findingIds: input.findingIds,
    evidence: input.evidence,
    maturity: "synthetic",
    createdAt,
    digestVersion: input.digestVersion,
    sourceDigest: input.sourceDigest,
  });
}

/**
 * The allowlist projection every persistence and export path goes through. It builds a
 * fresh object field by field from the parsed receipt, so `excerpt`, any unknown key, and
 * anything a caller attached along the way never reach storage, a folder, or a download.
 */
export function toPersistedReceipt(receipt: unknown): PersistedReceipt {
  const parsed = validationReceiptSchema.parse(receipt);
  const projected: PersistedReceipt = {
    id: parsed.id,
    module: parsed.module,
    policyVersion: parsed.policyVersion,
    inputDigest: parsed.inputDigest,
    verdict: parsed.verdict,
    findingIds: parsed.findingIds.map((findingId) => String(findingId)),
    evidence: parsed.evidence.map((reference) => ({
      sourceId: reference.sourceId,
      sourceVersion: reference.sourceVersion,
      locator: reference.locator,
    })),
    maturity: parsed.maturity,
    createdAt: parsed.createdAt,
  };
  if (parsed.digestVersion !== undefined) projected.digestVersion = parsed.digestVersion;
  if (parsed.sourceDigest !== undefined) projected.sourceDigest = parsed.sourceDigest;
  return persistedReceiptSchema.parse(projected);
}

/** A receipt without `digestVersion` predates the field and is read as its module's v1. */
export function receiptDigestVersion(receipt: {
  module: ValidationModule;
  digestVersion?: DigestVersion;
}): DigestVersion {
  if (receipt.digestVersion) return receipt.digestVersion;
  if (receipt.module === "veil") return "veil.raw-text.v1";
  if (receipt.module === "plumb") return "plumb.claims.v1";
  return "gateway.request.v1";
}

export function serializeReceipt(receipt: ValidationReceipt | PersistedReceipt) {
  return JSON.stringify(toPersistedReceipt(receipt), null, 2);
}

const RECEIPT_FILE_ID_LIMIT = 160;

/**
 * Derived from the receipt id, so two receipts never share a file name (a folder write
 * would otherwise overwrite one with the other). Characters outside `[A-Za-z0-9_-]`,
 * including the ISO colons Windows forbids, are flattened; legacy ids read the same way.
 */
export function receiptFileName(receipt: Pick<ValidationReceipt, "module" | "id">) {
  const prefix = `receipt.${receipt.module}.`;
  const id = receipt.id.startsWith(prefix) ? receipt.id.slice(prefix.length) : receipt.id;
  const safe = id
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, RECEIPT_FILE_ID_LIMIT);
  return `juriscore-${receipt.module}-receipt-${safe || "unnamed"}.json`;
}

/** Filesystem-safe timestamp for report and export filenames. */
export function fileTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function downloadText(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadReceipt(receipt: ValidationReceipt | PersistedReceipt) {
  downloadText(receiptFileName(receipt), serializeReceipt(receipt), "application/json");
}
