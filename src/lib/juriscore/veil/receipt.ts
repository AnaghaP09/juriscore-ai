import type { ReceiptPolicyRef, ReceiptRunInput } from "../core/receipts";
import type { VeilResult } from "./engine";

// The receipt witnesses the boundary decision about the submitted context, so it
// records the raw-input verdict; the sanitized verdict is recomputable because
// protectText is pure.
export function veilReceiptInput(
  result: VeilResult,
  rawInput: string,
  policies: ReceiptPolicyRef[],
): ReceiptRunInput {
  return {
    module: "veil",
    rawInput,
    verdict: result.rawVerdict,
    findingIds: result.findings.map((finding) => finding.id),
    evidence: [],
    policies,
  };
}
