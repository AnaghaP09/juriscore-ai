import { sha256Hex, type ReceiptPolicyRef, type ReceiptRunInput } from "../core/receipts";
import { canonicalJson } from "../predict/envelope";
import type { PlumbClaim, PlumbResult } from "./engine";
import {
  BUILT_IN_SUBJECTS,
  claimsFromDiff,
  claimsFromDocument,
  documentSentences,
  parseSourceSnapshot,
  parseUnifiedDiff,
} from "./sources";

export interface PlumbSourceText {
  /** The diff or source file text exactly as it was loaded. */
  diff: string;
  /** The documents compared, by name, with their extracted text. */
  documents: { name: string; text: string }[];
}

export interface PlumbSourceDigests {
  diffDigest: string;
  documentDigests: Record<string, string>;
  /** Canonical digest over the diff digest plus each document digest, sorted by name. */
  sourceDigest: string;
}

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The semantic claims digest input (`plumb.sources.v2`). Each claim is projected to what
 * it says and where it came from by name; its id, locator, and source version are left
 * out, because they move when unrelated text is inserted or a file is re-loaded without
 * the claim itself changing. Those stay in `evidence` and in `sourceDigest`.
 */
export function plumbClaimsCanonical(inputs: {
  authorities: PlumbClaim[];
  assertions: PlumbClaim[];
}) {
  const project = (role: "authority" | "assertion") => (claim: PlumbClaim) => ({
    role,
    sourceId: claim.reference.sourceId,
    subject: claim.subject,
    value: claim.value,
    unit: claim.unit ?? null,
    statement: claim.statement,
  });
  const claims = [
    ...inputs.authorities.map(project("authority")),
    ...inputs.assertions.map(project("assertion")),
  ].sort(
    (a, b) =>
      compareStrings(a.role, b.role) ||
      compareStrings(a.sourceId, b.sourceId) ||
      compareStrings(a.subject, b.subject) ||
      compareStrings(a.statement, b.statement),
  );
  return canonicalJson(claims);
}

export async function plumbSourceDigests(sources: PlumbSourceText): Promise<PlumbSourceDigests> {
  const diffDigest = await sha256Hex(sources.diff);
  const documentDigests: Record<string, string> = {};
  const documents: { name: string; digest: string }[] = [];
  for (const document of sources.documents) {
    const digest = await sha256Hex(document.text);
    documentDigests[document.name] = digest;
    documents.push({ name: document.name, digest });
  }
  documents.sort((a, b) => compareStrings(a.name, b.name) || compareStrings(a.digest, b.digest));
  const sourceDigest = await sha256Hex(canonicalJson({ diff: diffDigest, documents }));
  return { diffDigest, documentDigests, sourceDigest };
}

/**
 * Re-extracts claims from source text with the same pure functions the workbench uses,
 * without touching any store. A text that is not a diff is read as a source snapshot,
 * as the workbench does.
 */
export function plumbClaimsFromSources(sources: PlumbSourceText) {
  const file = parseUnifiedDiff(sources.diff)[0] ?? parseSourceSnapshot(sources.diff, "source");
  const authorities = claimsFromDiff(file, BUILT_IN_SUBJECTS, "verifier");
  const assertions = sources.documents.flatMap((document) =>
    claimsFromDocument(documentSentences(document.text), BUILT_IN_SUBJECTS, {
      sourceId: document.name,
      sourceVersion: "verifier",
    }),
  );
  return { authorities, assertions };
}

// Evidence copies reference fields only; excerpt — the schema's one free-text
// field — is stripped by construction so no claim text reaches the receipt. Each
// reference's source version is the content digest of the source it points into, never
// a load time, so the same files re-loaded later produce the same evidence.
export function plumbReceiptInput(
  result: PlumbResult,
  inputs: { authorities: PlumbClaim[]; assertions: PlumbClaim[] },
  policies: ReceiptPolicyRef[],
  digests: PlumbSourceDigests,
): ReceiptRunInput {
  const versionFor = (claim: PlumbClaim, role: "authority" | "assertion") =>
    role === "authority"
      ? digests.diffDigest
      : (digests.documentDigests[claim.reference.sourceId] ?? digests.sourceDigest);
  const reference = (claim: PlumbClaim, role: "authority" | "assertion") => ({
    sourceId: claim.reference.sourceId,
    sourceVersion: versionFor(claim, role),
    locator: claim.reference.locator,
  });
  return {
    module: "plumb",
    rawInput: plumbClaimsCanonical(inputs),
    digestVersion: "plumb.sources.v2",
    sourceDigest: digests.sourceDigest,
    verdict: result.verdict,
    findingIds: result.findings.map((finding) => finding.id),
    evidence: result.findings.flatMap((finding) =>
      finding.authority
        ? [reference(finding.assertion, "assertion"), reference(finding.authority, "authority")]
        : [reference(finding.assertion, "assertion")],
    ),
    policies,
  };
}
