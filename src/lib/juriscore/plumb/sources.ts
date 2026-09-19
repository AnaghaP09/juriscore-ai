import type { PlumbClaim, PlumbValue } from "./engine";

/**
 * Turning a real pull request and a real document into Plumb claims.
 *
 * Plumb compares claims; it does not read prose freely. Everything here is a
 * deterministic scanner driven by an explicit subject dictionary, so a reader can
 * always point at the rule that produced a claim. A subject the dictionary does not
 * describe yields no claim rather than a guess.
 */

export interface PlumbSubject {
  id: string;
  label: string;
  /** Unit the comparison is expressed in, when the subject has one. */
  unit?: string;
  /** Identifiers in code that carry this value. */
  codeKeys: string[];
  /** Words that mark a sentence in a document as talking about this subject. */
  documentTerms: string[];
}

export const BUILT_IN_SUBJECTS: PlumbSubject[] = [
  {
    id: "kyc_threshold",
    label: "KYC threshold",
    unit: "USD",
    codeKeys: ["kycThreshold", "kyc_threshold", "kycLimit"],
    documentTerms: ["know-your-customer", "kyc", "enhanced due diligence", "enhanced review"],
  },
  {
    id: "cross_border_fee",
    label: "Cross-border fee",
    unit: "percent",
    codeKeys: ["crossBorderFeeBps", "cross_border_fee_bps", "crossBorderFee", "cross_border_fee"],
    documentTerms: ["cross-border", "remittance fee", "cross border fee"],
  },
  {
    id: "retention_days",
    label: "Data retention",
    unit: "days",
    codeKeys: ["retentionDays", "retention_days", "eventRetentionDays"],
    documentTerms: ["retained for", "retention period", "retention window"],
  },
];

// ---------------------------------------------------------------------------
// Repository input
// ---------------------------------------------------------------------------

export interface RepositoryRef {
  owner: string;
  repo: string;
}

/**
 * Accepts the forms people actually paste: a full URL, an owner/repo pair, or a
 * clone string. Anything else returns null so the caller can show one clear error.
 */
export function parseRepositoryInput(raw: string): RepositoryRef | null {
  const trimmed = raw
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  if (!trimmed) return null;

  const withoutScheme = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^github\.com\//i, "");

  const segments = withoutScheme.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [owner, repo] = segments;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;

  return { owner, repo };
}

export function pullRequestDiffUrl({ owner, repo }: RepositoryRef, pullNumber: number) {
  return `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`;
}

export function pullRequestWebUrl({ owner, repo }: RepositoryRef, pullNumber: number) {
  return `https://github.com/${owner}/${repo}/pull/${pullNumber}`;
}

// ---------------------------------------------------------------------------
// Unified diff
// ---------------------------------------------------------------------------

export type DiffLineKind = "add" | "del" | "ctx";

export interface DiffLine {
  /** Line number in the file after the change, or before it for a deletion. */
  n: number;
  kind: DiffLineKind;
  text: string;
}

export interface DiffFile {
  path: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

const HUNK_HEADER = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/;

/**
 * Parses a unified diff. Only the parts Plumb needs are kept: the file path and the
 * added, removed, and context lines with their line numbers.
 */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  // Header patterns are only headers before the first hunk. Inside a hunk a line
  // beginning with "+++", "---", or "index " is content the change added or removed,
  // and treating it as a header would silently drop it from the comparison.
  let inHunk = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const diffHeader = /^diff --git a\/(.+?) b\/(.+)$/.exec(rawLine);
    if (diffHeader) {
      current = { path: diffHeader[2], lines: [], additions: 0, deletions: 0 };
      files.push(current);
      inHunk = false;
      continue;
    }

    if (!inHunk) {
      // A bare "+++ b/path" diff (what `git diff` emits without the header, and what
      // the GitHub patch field contains per file) still identifies the file.
      const plusHeader = /^\+\+\+ (?:b\/)?(.+)$/.exec(rawLine);
      if (plusHeader) {
        if (!current) {
          current = { path: plusHeader[1], lines: [], additions: 0, deletions: 0 };
          files.push(current);
        } else if (current.path !== plusHeader[1] && current.lines.length === 0) {
          current.path = plusHeader[1];
        }
        continue;
      }

      if (/^(---|index |new file|deleted file|similarity|rename|old mode|new mode)/.test(rawLine)) {
        continue;
      }
    }

    const hunk = HUNK_HEADER.exec(rawLine);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }

    if (!current) continue;

    if (rawLine.startsWith("+")) {
      current.lines.push({ n: newLine, kind: "add", text: rawLine.slice(1) });
      current.additions += 1;
      newLine += 1;
    } else if (rawLine.startsWith("-")) {
      current.lines.push({ n: oldLine, kind: "del", text: rawLine.slice(1) });
      current.deletions += 1;
      oldLine += 1;
    } else if (rawLine.startsWith(" ")) {
      current.lines.push({ n: newLine, kind: "ctx", text: rawLine.slice(1) });
      oldLine += 1;
      newLine += 1;
    }
  }

  return files.filter((file) => file.lines.length > 0);
}

// ---------------------------------------------------------------------------
// Claims from code
// ---------------------------------------------------------------------------

const ASSIGNMENT = /([A-Za-z_][\w]*)\s*[:=]\s*(-?[\d_]+(?:\.\d+)?|true|false|"[^"]*"|'[^']*')/;

function literalValue(raw: string): PlumbValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^["']/.test(raw)) return raw.slice(1, -1);
  return Number(raw.replace(/_/g, ""));
}

/**
 * Reads `key: value` assignments out of the lines a pull request adds. A key ending
 * in `Bps` is converted to percent, because that is the unit the documentation states
 * and comparing 250 against 2.5 would otherwise read as drift.
 */
export function claimsFromDiff(
  file: DiffFile,
  subjects: PlumbSubject[],
  sourceVersion: string,
): PlumbClaim[] {
  const claims: PlumbClaim[] = [];

  for (const line of file.lines) {
    if (line.kind !== "add") continue;

    const match = ASSIGNMENT.exec(line.text);
    if (!match) continue;

    const [, key, rawValue] = match;
    const subject = subjects.find((candidate) =>
      candidate.codeKeys.some((codeKey) => codeKey.toLowerCase() === key.toLowerCase()),
    );
    if (!subject) continue;

    let value = literalValue(rawValue);
    if (typeof value === "number" && /bps$/i.test(key) && subject.unit === "percent") {
      value = value / 100;
    }

    claims.push({
      id: `code-${subject.id}`,
      subject: subject.id,
      value,
      unit: subject.unit,
      statement: line.text.trim(),
      reference: { sourceId: file.path, sourceVersion, locator: `line ${line.n}` },
    });
  }

  return claims;
}

// ---------------------------------------------------------------------------
// Claims from documents
// ---------------------------------------------------------------------------

const MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };

function numberNear(sentence: string, unit: string | undefined): number | null {
  if (unit === "percent") {
    const percent = /(\d+(?:\.\d+)?)\s*(?:%|percent)/i.exec(sentence);
    return percent ? Number(percent[1]) : null;
  }

  // Currency and plain counts: "$10,000", "$10K", "25,000", "30 days". A figure marked
  // with a currency symbol wins over a bare one, so "2 accounts exceeding $10,000"
  // reads the threshold rather than the count that happens to come first.
  const amount =
    /\$\s?(\d[\d,]*(?:\.\d+)?)\s*([KMB])?\b/i.exec(sentence) ??
    /\b(\d[\d,]*(?:\.\d+)?)\s*([KMB])?\b/i.exec(sentence);
  if (!amount) return null;

  const base = Number(amount[1].replace(/,/g, ""));
  const suffix = amount[2]?.toLowerCase();
  return suffix ? base * (MULTIPLIER[suffix] ?? 1) : base;
}

export interface DocumentSentence {
  id: string;
  text: string;
}

/**
 * Splits extracted document text into sentences that can be cited individually, so a
 * finding points at the line a reader can go and check.
 */
export function documentSentences(text: string): DocumentSentence[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z$])/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    .map((piece, index) => ({ id: `s${index + 1}`, text: piece }));
}

/**
 * Finds sentences that talk about a known subject and carry a number, and turns each
 * into an assertion. A sentence mentioning a subject without a value is left alone:
 * Plumb would have nothing to compare, and inventing a value would be worse than
 * reporting nothing.
 */
export function claimsFromDocument(
  sentences: DocumentSentence[],
  subjects: PlumbSubject[],
  reference: { sourceId: string; sourceVersion: string },
): PlumbClaim[] {
  const claims: PlumbClaim[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const haystack = sentence.text.toLowerCase();
    const subject = subjects.find((candidate) =>
      candidate.documentTerms.some((term) => haystack.includes(term.toLowerCase())),
    );
    if (!subject || seen.has(subject.id)) continue;

    const value = numberNear(sentence.text, subject.unit);
    if (value === null) continue;

    seen.add(subject.id);
    claims.push({
      id: `doc-${subject.id}`,
      subject: subject.id,
      value,
      unit: subject.unit,
      statement: sentence.text,
      reference: { ...reference, locator: sentence.id },
    });
  }

  return claims;
}
