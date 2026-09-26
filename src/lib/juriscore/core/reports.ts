import type { PersistedReceipt } from "./contracts";
import type { VeilResult, VeilStrategy } from "../veil/engine";
import type { PlumbClaim, PlumbResult } from "../plumb/engine";

/**
 * Per-run reports the user saves by hand. They are downloads only: nothing here is
 * written to the receipt history or the receipt folder.
 */

export function veilReportFileName(stamp: string) {
  return `juriscore-veil-report-${stamp}.txt`;
}

export function plumbReportFileName(stamp: string) {
  return `juriscore-plumb-report-${stamp}.md`;
}

/** Sanitized text plus a findings summary: labels and counts, never detected values. */
export function veilReportText(
  result: VeilResult,
  strategy: VeilStrategy,
  receipt: PersistedReceipt | null,
) {
  const lines = [
    "JurisCore Veil report",
    "",
    `Raw input verdict: ${result.rawVerdict.toUpperCase()}`,
    `Sanitized verdict: ${result.sanitizedVerdict.toUpperCase()}`,
    `Strategy: ${strategy}`,
    `Receipt: ${receipt?.id ?? "none"}`,
    `Policies: ${receipt?.policyVersion ?? (result.policyIds.join(", ") || "none")}`,
    "",
    "Findings (label: occurrences)",
  ];
  if (result.findings.length === 0) lines.push("- none");
  for (const finding of result.findings) lines.push(`- ${finding.label}: ${finding.count}`);
  lines.push("", "Sanitized text", "--------------", result.sanitizedText, "");
  return lines.join("\n");
}

const STATUS_LABEL = {
  drifted: "Contradiction",
  cannot_determine: "Cannot determine",
  matches: "Agrees",
} as const;

function claimValue(claim: PlumbClaim | null) {
  if (!claim) return "—";
  return `${String(claim.value)}${claim.unit ? ` ${claim.unit}` : ""}`;
}

function reference(claim: PlumbClaim | null) {
  if (!claim) return "—";
  return `${claim.reference.sourceId} · ${claim.reference.locator}`;
}

function cell(text: string) {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Verdict, the claims compared, and the evidence references for each. */
export function plumbReportMarkdown(result: PlumbResult, receipt: PersistedReceipt | null) {
  const lines = [
    "# JurisCore Plumb report",
    "",
    `- Verdict: **${result.verdict.toUpperCase()}**`,
    `- Receipt: ${receipt?.id ?? "none"}`,
    `- Policies: ${receipt?.policyVersion ?? (result.policyIds.join(", ") || "none")}`,
    `- Agrees: ${result.counts.matches} · Contradictions: ${result.counts.drifted} · Cannot determine: ${result.counts.cannot_determine}`,
    "",
    "## Claims compared",
    "",
  ];
  if (result.findings.length === 0) {
    lines.push("No claim in the document matched a subject Plumb knows how to compare.");
  } else {
    lines.push(
      "| Subject | Result | Document says | Code says | Document reference | Code reference |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const finding of result.findings) {
      const row = [
        finding.subject,
        STATUS_LABEL[finding.status],
        claimValue(finding.assertion),
        claimValue(finding.authority),
        reference(finding.assertion),
        reference(finding.authority),
      ];
      lines.push(`| ${row.map(cell).join(" | ")} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
