import type { ReceiptPolicyRef, ReceiptRunInput } from "../core/receipts";
import type { PlumbClaim, PlumbResult } from "./engine";

// Evidence copies reference fields only; excerpt — the schema's one free-text
// field — is stripped by construction so no claim text reaches the receipt.
export function plumbReceiptInput(
  result: PlumbResult,
  inputs: { authorities: PlumbClaim[]; assertions: PlumbClaim[] },
  policies: ReceiptPolicyRef[],
): ReceiptRunInput {
  return {
    module: "plumb",
    rawInput: JSON.stringify(inputs),
    verdict: result.verdict,
    findingIds: result.findings.map((finding) => finding.id),
    evidence: result.findings
      .flatMap((finding) =>
        finding.authority
          ? [finding.assertion.reference, finding.authority.reference]
          : [finding.assertion.reference],
      )
      .map(({ sourceId, sourceVersion, locator }) => ({ sourceId, sourceVersion, locator })),
    policies,
  };
}
