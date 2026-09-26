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

export type DiffChangeKind = "added" | "modified" | "deleted" | "renamed";

export interface DiffFile {
  /**
   * The file's real path. A deletion keeps the path it had before the change; the
   * `/dev/null` a patch writes for the missing side is never taken as a path.
   */
  path: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
  /** What the change did to the file. Set for every file a diff produces. */
  change?: DiffChangeKind;
  /**
   * This file's section of the patch exactly as written, headers and "\ No newline at
   * end of file" markers included. Set for every file a diff produces; a digest of the
   * change hashes this rather than the lines Plumb keeps.
   */
  patch?: string;
  /**
   * True when the content is a whole file rather than a change. Every line is then the
   * current state of the source, so claims are read from all of them instead of only
   * from the lines a diff added.
   */
  snapshot?: boolean;
}

/**
 * Reads a whole source or configuration file as the current state of the truth. Not
 * every check starts from a pull request: pointing Plumb at the file that holds the
 * values is the simpler case, and it carries no additions to single out.
 */
export function parseSourceSnapshot(text: string, path: string): DiffFile {
  const lines: DiffLine[] = text.split(/\r?\n/).map((line, index) => ({
    n: index + 1,
    kind: "ctx",
    text: line,
  }));

  return { path, lines, additions: 0, deletions: 0, snapshot: true };
}

const HUNK_HEADER = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

/** Shown when a pasted fragment carries no file header to name. */
export const UNNAMED_DIFF_PATH = "pasted fragment";

// The side of a patch that does not exist ("--- /dev/null" for a new file, "+++ /dev/null"
// for a deleted one). It names no file and is never taken as a path.
const DEV_NULL = /^\/dev\/null\s*$/;

// Single-character escapes Git writes inside a quoted path, as the byte each stands for.
const QUOTED_PATH_ESCAPES: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

/**
 * Reads a path Git wrote in C-style quotes ("a/caf\303\251.md"), starting at the opening
 * quote. Octal escapes are bytes of UTF-8. Returns the decoded path and the text after
 * the closing quote, or null when the quoting is malformed.
 */
function readQuotedPath(text: string): { value: string; rest: string } | null {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  let index = 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const value = new TextDecoder().decode(new Uint8Array(bytes));
      return { value, rest: text.slice(index + 1) };
    }
    if (char !== "\\") {
      const literal = String.fromCodePoint(text.codePointAt(index) ?? 0);
      bytes.push(...encoder.encode(literal));
      index += literal.length;
      continue;
    }
    const octal = /^[0-3][0-7]{2}/.exec(text.slice(index + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      index += 4;
      continue;
    }
    const escaped = QUOTED_PATH_ESCAPES[text[index + 1]];
    if (escaped === undefined) return null;
    bytes.push(escaped);
    index += 2;
  }
  return null;
}

function stripSide(path: string, side: "a/" | "b/") {
  return path.startsWith(side) ? path.slice(side.length) : path;
}

/**
 * The path a "---" or "+++" header names, or null for `/dev/null`. Git quotes a path
 * with unusual characters; otherwise a tab ends the path, since GNU diff (and Git, for
 * a path with spaces) writes a tab and sometimes a timestamp after it.
 */
function headerPath(raw: string, side: "a/" | "b/"): string | null {
  const quoted = raw.startsWith('"') ? readQuotedPath(raw) : null;
  const path = quoted ? quoted.value : raw.split("\t")[0];
  if (DEV_NULL.test(path)) return null;
  return stripSide(path, side);
}

/** The two paths of a "diff --git a/old b/new" line, either of which may be quoted. */
function diffGitPaths(rest: string): { oldPath: string; newPath: string } | null {
  if (!rest.startsWith('"')) {
    const plain = /^a\/(.+?) b\/(.+)$/.exec(rest);
    if (plain) return { oldPath: plain[1], newPath: plain[2] };
    const quotedNew = /^a\/(.+?) (".*")$/.exec(rest);
    const decoded = quotedNew ? readQuotedPath(quotedNew[2]) : null;
    if (!quotedNew || !decoded) return null;
    return { oldPath: quotedNew[1], newPath: stripSide(decoded.value, "b/") };
  }

  const first = readQuotedPath(rest);
  if (!first) return null;
  const remainder = first.rest.trimStart();
  const second = remainder.startsWith('"') ? readQuotedPath(remainder)?.value : remainder;
  if (!second) return null;
  return { oldPath: stripSide(first.value, "a/"), newPath: stripSide(second, "b/") };
}

const METADATA_LINE = /^(---|index |new file|deleted file|similarity|rename|old mode|new mode)/;

export interface ParseUnifiedDiffOptions {
  /**
   * Also return files whose change is metadata only (a pure rename, a mode change),
   * which carry no lines. Plumb has nothing to read in them, so they are left out by
   * default; a digest of the whole change needs them.
   */
  includeMetadataOnly?: boolean;
}

/**
 * Parses a unified diff. Only the parts Plumb needs are kept: the file path, what the
 * change did to the file, and the added, removed, and context lines with their line
 * numbers. Each file also keeps its section of the patch as written.
 */
export function parseUnifiedDiff(text: string, options: ParseUnifiedDiffOptions = {}): DiffFile[] {
  const files: DiffFile[] = [];
  const patches = new Map<DiffFile, string[]>();
  let current: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  // Lines the last hunk header announced that have not been read yet. Until both reach
  // zero, every line is hunk content, and a line beginning with "+++", "---", or
  // "index " is something the change added or removed; treating it as a header would
  // silently drop it from the comparison. Once the hunk is consumed, header lines are
  // headers again, so a patch holding several files without "diff --git" lines still
  // splits into those files.
  let oldRemaining = 0;
  let newRemaining = 0;
  // What the "--- " header said, for a patch that has no "diff --git" line. A deletion
  // has only this side to name the file.
  let oldPath: string | null = null;
  let oldIsDevNull = false;
  // A "--- " line that belongs to a file the next "+++ " line opens.
  let pendingHeader: string | null = null;

  for (const written of text.split("\n")) {
    // The patch keeps each line exactly as written, carriage return included, so a
    // change that only adds a "\r" still changes the digest. Parsing, and the lines
    // Plumb reads, use the line without it, as they always have.
    const rawLine = written.endsWith("\r") ? written.slice(0, -1) : written;
    const inHunk = oldRemaining > 0 || newRemaining > 0;

    // Never content: a hunk line starts with "+", "-", " ", or "\". A hunk header that
    // miscounted its lines therefore cannot swallow the next file.
    const gitHeader = /^diff --git (.+)$/.exec(rawLine);
    const gitPaths = gitHeader ? diffGitPaths(gitHeader[1]) : null;
    if (gitPaths) {
      current = {
        path: gitPaths.newPath,
        lines: [],
        additions: 0,
        deletions: 0,
        change: gitPaths.oldPath === gitPaths.newPath ? "modified" : "renamed",
      };
      files.push(current);
      patches.set(current, [written]);
      oldRemaining = 0;
      newRemaining = 0;
      oldPath = null;
      oldIsDevNull = false;
      pendingHeader = null;
      continue;
    }

    if (!inHunk) {
      // A file still reading its headers has no lines yet. A header after a file's
      // lines starts the next file.
      const opening = current !== null && current.lines.length === 0;

      const minusHeader = /^--- (.+)$/.exec(rawLine);
      if (minusHeader) {
        oldPath = headerPath(minusHeader[1], "a/");
        oldIsDevNull = oldPath === null;
        if (current && opening) {
          patches.get(current)?.push(written);
        } else {
          current = null;
          pendingHeader = written;
        }
        continue;
      }

      // A bare "+++ b/path" diff (what `git diff` emits without the header, and what
      // the GitHub patch field contains per file) still identifies the file.
      const plusHeader = /^\+\+\+ (.+)$/.exec(rawLine);
      if (plusHeader) {
        const path = headerPath(plusHeader[1], "b/");
        if (current && opening) {
          patches.get(current)?.push(written);
          // A deletion keeps the path "diff --git" gave it.
          if (path === null) {
            current.change = "deleted";
          } else {
            if (current.path !== path) current.path = path;
            if (oldIsDevNull) current.change = "added";
          }
        } else {
          let change: DiffChangeKind = "modified";
          if (path === null) change = "deleted";
          else if (oldIsDevNull) change = "added";
          else if (oldPath !== null && oldPath !== path) change = "renamed";
          // A deletion keeps the path it had, from the "--- a/path" line before this one.
          current = {
            path: path ?? oldPath ?? UNNAMED_DIFF_PATH,
            lines: [],
            additions: 0,
            deletions: 0,
            change,
          };
          files.push(current);
          patches.set(current, pendingHeader === null ? [written] : [pendingHeader, written]);
        }
        oldPath = null;
        oldIsDevNull = false;
        pendingHeader = null;
        continue;
      }

      if (current && opening) {
        if (/^new file/.test(rawLine)) current.change = "added";
        else if (/^deleted file/.test(rawLine)) current.change = "deleted";
      }

      if (METADATA_LINE.test(rawLine)) {
        if (current) patches.get(current)?.push(written);
        continue;
      }
    }

    const hunk = HUNK_HEADER.exec(rawLine);
    if (hunk) {
      // A hunk with no file header in front of it is a fragment copied out of a review
      // or a terminal. That is the most common way a diff is pasted, so it is read as
      // an unnamed file rather than discarded.
      if (!current) {
        current = {
          path: UNNAMED_DIFF_PATH,
          lines: [],
          additions: 0,
          deletions: 0,
          change: "modified",
        };
        files.push(current);
        patches.set(current, pendingHeader === null ? [] : [pendingHeader]);
        pendingHeader = null;
      }
      patches.get(current)?.push(written);
      // An omitted count means one line.
      oldLine = Number(hunk[1]);
      oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newLine = Number(hunk[3]);
      newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
      continue;
    }

    if (!current) continue;
    patches.get(current)?.push(written);

    if (rawLine.startsWith("+")) {
      current.lines.push({ n: newLine, kind: "add", text: rawLine.slice(1) });
      current.additions += 1;
      newLine += 1;
      newRemaining = Math.max(0, newRemaining - 1);
    } else if (rawLine.startsWith("-")) {
      current.lines.push({ n: oldLine, kind: "del", text: rawLine.slice(1) });
      current.deletions += 1;
      oldLine += 1;
      oldRemaining = Math.max(0, oldRemaining - 1);
    } else if (rawLine.startsWith(" ")) {
      current.lines.push({ n: newLine, kind: "ctx", text: rawLine.slice(1) });
      oldLine += 1;
      newLine += 1;
      oldRemaining = Math.max(0, oldRemaining - 1);
      newRemaining = Math.max(0, newRemaining - 1);
    } else if (rawLine === "" && inHunk) {
      // A blank context line whose leading space an editor trimmed. It still counts
      // toward the hunk, so the hunk can end where its header says it does.
      oldRemaining = Math.max(0, oldRemaining - 1);
      newRemaining = Math.max(0, newRemaining - 1);
    }
  }

  for (const file of files) {
    const raw = patches.get(file) ?? [];
    // The trailing newline of the pasted text is not part of any file's change.
    while (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
    file.patch = raw.join("\n");
  }

  return options.includeMetadataOnly ? files : files.filter((file) => file.lines.length > 0);
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
    // A change is authoritative only where it adds; a whole file is authoritative
    // everywhere.
    if (!file.snapshot && line.kind !== "add") continue;
    if (line.kind === "del") continue;

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
