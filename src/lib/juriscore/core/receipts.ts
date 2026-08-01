import {
  validationReceiptSchema,
  type EvidenceReference,
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
  rawInput: string;
  verdict: ValidatorVerdict;
  findingIds: string[];
  evidence: EvidenceReference[];
  policies: ReceiptPolicyRef[];
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

export async function sha256Hex(text: string) {
  if (!globalThis.crypto?.subtle) {
    throw new ReceiptError("A secure context is required to digest the input for a receipt.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createReceipt(input: ReceiptRunInput): Promise<ValidationReceipt> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const inputDigest = await sha256Hex(input.rawInput);
  return validationReceiptSchema.parse({
    id: `receipt.${input.module}.${createdAt}.${inputDigest.slice(0, 8)}`,
    module: input.module,
    policyVersion: encodePolicyVersion(input.policies),
    inputDigest,
    verdict: input.verdict,
    findingIds: input.findingIds,
    evidence: input.evidence,
    maturity: "synthetic",
    createdAt,
  });
}

export function serializeReceipt(receipt: ValidationReceipt) {
  return JSON.stringify(receipt, null, 2);
}

// ISO colons are illegal in Windows filenames, so createdAt is flattened.
export function receiptFileName(receipt: ValidationReceipt) {
  return `juriscore-${receipt.module}-receipt-${receipt.createdAt.replace(/[:.]/g, "-")}.json`;
}

export function downloadReceipt(receipt: ValidationReceipt) {
  const blob = new Blob([serializeReceipt(receipt)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = receiptFileName(receipt);
  anchor.click();
  URL.revokeObjectURL(url);
}
