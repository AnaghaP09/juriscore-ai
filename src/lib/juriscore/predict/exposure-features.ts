import {
  EXPOSURE_FEATURES_VERSION as CONTRACT_FEATURES_VERSION,
  type ExposureSpan,
  type ExposureSpanCategory,
} from "../core/contracts";
import type { VeilProfile } from "../veil/engine";

/**
 * Deterministic features of text Veil has already sanitized, for estimating whether it
 * still holds something Veil's fixed detectors did not catch: an unfamiliar key format,
 * a secret in an assignment, an oddly spaced card number, a new prompt-attack phrasing.
 *
 * Everything here is a pure function of the text: no clock, no randomness, no network.
 * Candidate spans are found first, then aggregated by maximum and count, so the vector
 * does not depend on the order in which spans are found. Spans carry offsets and a
 * category only; the matched text is never returned.
 */

export const EXPOSURE_FEATURES_VERSION = CONTRACT_FEATURES_VERSION;

export interface ExposureInput {
  /** Veil's sanitized output. The raw input never reaches this predictor. */
  sanitizedText: string;
  profile: VeilProfile;
  policyIds: string[];
}

/** Feature names in the order weights and attributions list them. */
export const EXPOSURE_FEATURE_NAMES = [
  "max_span_score",
  "secret_shapes",
  "assigned_secrets",
  "high_entropy_tokens",
  "card_numbers",
  "network_identifiers",
  "labelled_identifiers",
  "prompt_attacks",
  "entropy_density",
  "redaction_density",
] as const;

export type ExposureFeatureName = (typeof EXPOSURE_FEATURE_NAMES)[number];

export type ExposureFeatureVector = Record<ExposureFeatureName, number>;

export interface ExposureFeatureExtraction {
  featuresVersion: typeof EXPOSURE_FEATURES_VERSION;
  vector: ExposureFeatureVector;
  /** Non-overlapping spans for review, sorted by offset. */
  spans: ExposureSpan[];
}

// Values are rounded so that a vector is byte-stable across platforms that could differ
// in the last bits of log().
const PRECISION = 1e6;

function round(value: number) {
  return Math.round(value * PRECISION) / PRECISION;
}

function compareStrings(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Redaction tokens
// ---------------------------------------------------------------------------

/**
 * Veil's own placeholders: `[REDACTED_EMAIL]` when redacting, `[EMAIL_1]` when
 * tokenizing. They are what protection looks like, so they are never a span.
 */
const REDACTION_TOKEN = /\[(?:REDACTED_[A-Z0-9_]+|[A-Z][A-Z0-9_]*_\d+)\]/g;

interface Range {
  start: number;
  end: number;
}

/** Every placeholder, sorted by offset and non-overlapping. */
export function redactionTokenRanges(text: string): Range[] {
  return Array.from(text.matchAll(REDACTION_TOKEN), (match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

/**
 * Stands in for every character of a placeholder while rules run. It is not a word,
 * token, digit, or separator character, so no value-shaped rule can match inside or
 * across a placeholder, while prose-shaped rules (a prompt attack around a redacted
 * address) still read past it. It is one UTF-16 unit per replaced character, so offsets
 * in the masked text are offsets in the original.
 */
const MASK = String.fromCharCode(0xe000);

function maskRedactionTokens(text: string, tokens: Range[]) {
  if (tokens.length === 0) return text;
  const parts: string[] = [];
  let cursor = 0;
  for (const token of tokens) {
    parts.push(text.slice(cursor, token.start), MASK.repeat(token.end - token.start));
    cursor = token.end;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}

/** Index of the first range that ends after `offset`, by binary search. */
function firstRangeEndingAfter(ranges: Range[], offset: number) {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ranges[middle].end <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The parts of a span outside every placeholder, trimmed of surrounding whitespace, so
 * a placeholder inside an attack sentence is never itself highlighted.
 */
function withoutTokens(text: string, span: ExposureSpan, tokens: Range[]): ExposureSpan[] {
  const pieces: ExposureSpan[] = [];
  const keep = (start: number, end: number) => {
    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /\s/.test(text[end - 1])) end -= 1;
    if (start < end) pieces.push({ ...span, start, end });
  };
  let cursor = span.start;
  for (
    let index = firstRangeEndingAfter(tokens, span.start);
    index < tokens.length && tokens[index].start < span.end;
    index += 1
  ) {
    keep(cursor, Math.min(tokens[index].start, span.end));
    cursor = Math.max(cursor, tokens[index].end);
  }
  keep(cursor, span.end);
  return pieces;
}

// ---------------------------------------------------------------------------
// Token measures
// ---------------------------------------------------------------------------

/** Shannon entropy in bits per character. */
export function shannonEntropy(value: string) {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function characterClasses(value: string) {
  return Number(/[a-z]/.test(value)) + Number(/[A-Z]/.test(value)) + Number(/[0-9]/.test(value));
}

/** The Luhn checksum used by payment card numbers. */
export function luhnValid(digits: string) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return false;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const IPV6_GROUP = /^[0-9A-Fa-f]{1,4}$/;

/**
 * An IPv6 address in full (eight groups) or compressed (one `::` standing for at least
 * one zero group) form. At least one digit is required, so words such as `dead::beef`
 * in prose or code are not taken for addresses.
 */
export function ipv6Valid(value: string) {
  if (!/[0-9]/.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = (half: string) => (half === "" ? [] : half.split(":"));
  if (halves.length === 1) {
    const all = groups(value);
    return all.length === 8 && all.every((group) => IPV6_GROUP.test(group));
  }
  const all = [...groups(halves[0]), ...groups(halves[1])];
  return all.length <= 7 && all.every((group) => IPV6_GROUP.test(group));
}

function entropyScore(value: string, ceiling: number) {
  const entropy = shannonEntropy(value);
  if (entropy < 3.5) return null;
  return ceiling * Math.min(1, (entropy - 3) / 1.5);
}

// ---------------------------------------------------------------------------
// Span rules
// ---------------------------------------------------------------------------

interface SpanRule {
  category: ExposureSpanCategory;
  pattern: RegExp;
  /**
   * Score for a match, or null to reject it. `value` is the part the span covers: the
   * whole match, or its last capture group when the rule has a label in front.
   */
  score: (value: string) => number | null;
  /** The span covers the last capture group (which must end the match). */
  valueGroup?: 1;
  /**
   * Prose rules may read across a placeholder. Every other rule describes a value, and
   * a value that includes a placeholder is Veil's protection, not a miss.
   */
  crossesPlaceholders?: true;
}

const TOKEN_CHARS = "A-Za-z0-9+/=_\\-.~";

// Well-known credential prefixes that Veil's current detectors do not cover.
const CLOUD_KEY =
  /(?<![A-Za-z0-9])(?:ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{20,}|gh[ousr]_[A-Za-z0-9]{30,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{36})(?![A-Za-z0-9])/g;

const SECRET_NAMES =
  "password|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|credentials?|private[_-]?key|client[_-]?secret|access[_-]?key|auth[_-]?key|signing[_-]?key";

// A placeholder value in configuration is not a secret.
const PLACEHOLDER_VALUE =
  /^(?:\*+|x{3,}|\.{3,}|<[^>]*>|\$\{[^}]*\}|\$[A-Za-z_]\w*|%[^%]+%|\{\{[^}]*\}\}|null|none|undefined|true|false|redacted|process\.env\.\w+)$/i;

const IDENTITY_LABELS =
  "patient|dob|date of birth|account|acct|member|subscriber|beneficiary|ssn|social security|routing|passport|licen[cs]e|mrn|claim|policy|npi|employee id|customer id|card";

const SPAN_RULES: SpanRule[] = [
  { category: "cloud_key", pattern: CLOUD_KEY, score: () => 0.95 },
  {
    category: "url_credentials",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@[^\s/]+/gi,
    score: () => 0.9,
  },
  {
    category: "jwt",
    pattern:
      /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])/g,
    score: (value) => {
      if (value.startsWith("eyJ")) return 0.9;
      return characterClasses(value) === 3 && shannonEntropy(value) >= 3.5 ? 0.55 : null;
    },
  },
  {
    category: "assigned_secret",
    pattern: new RegExp(
      `(?<![A-Za-z0-9])(?:[A-Za-z0-9]+[_-])*(?:${SECRET_NAMES})(?![A-Za-z0-9])["']?[ \\t]*[:=][ \\t]*["']?([^\\s"',;]{6,})`,
      "gi",
    ),
    valueGroup: 1,
    score: (value) => (PLACEHOLDER_VALUE.test(value) ? null : 0.9),
  },
  {
    category: "hex_secret",
    pattern: /(?<![A-Za-z0-9])[0-9a-fA-F]{32,}(?![A-Za-z0-9])/g,
    score: (value) => (/[0-9]/.test(value) && /[a-fA-F]/.test(value) ? 0.75 : null),
  },
  {
    category: "base64_secret",
    pattern: /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{24,}={0,2}(?![A-Za-z0-9+/=_-])/g,
    score: (value) => (characterClasses(value) === 3 && shannonEntropy(value) >= 3.5 ? 0.65 : null),
  },
  {
    category: "high_entropy_token",
    pattern: new RegExp(`(?<![${TOKEN_CHARS}])[${TOKEN_CHARS}]{16,}(?![${TOKEN_CHARS}])`, "g"),
    score: (value) => (characterClasses(value) === 3 ? entropyScore(value, 0.6) : null),
  },
  {
    category: "card_number",
    pattern: /(?<![\dA-Za-z])\d(?:[ .\-_/]{0,3}\d){12,18}(?![\dA-Za-z])/g,
    score: (value) => {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) return null;
      return luhnValid(digits) ? 0.85 : null;
    },
  },
  {
    category: "ip_address",
    pattern:
      /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])/g,
    score: () => 0.3,
  },
  {
    category: "ip_address",
    // Full and compressed IPv6. The shape is loose; `ipv6Valid` decides. A letter or
    // underscore on either side rules out code such as `std::vector`.
    pattern: /(?<![0-9A-Za-z_:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![0-9A-Za-z_:])/g,
    score: (value) => (ipv6Valid(value) ? 0.3 : null),
  },
  {
    category: "uuid",
    pattern:
      /(?<![0-9A-Fa-f-])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![0-9A-Fa-f-])/g,
    score: () => 0.35,
  },
  {
    category: "labelled_identifier",
    // A health, finance, or identity label followed closely by an identifier-like value
    // with at least three digits that no detector consumed. The gap may not cross a
    // redaction token (masked while rules run), so a label whose value was already
    // protected stays quiet.
    pattern: new RegExp(
      `\\b(?:${IDENTITY_LABELS})\\b[^\\n\\[\\]${MASK}]{0,24}?(?<![A-Za-z0-9-])((?=[A-Za-z0-9-]*\\d[A-Za-z0-9-]*\\d[A-Za-z0-9-]*\\d)[A-Za-z0-9][A-Za-z0-9-]{3,})(?![A-Za-z0-9-])`,
      "gi",
    ),
    valueGroup: 1,
    score: (value) => (/^(?:19|20)\d{2}$/.test(value) ? null : 0.55),
  },
  ...[
    // Role reassignment.
    /\b(?:you are now|from now on,? you (?:are|will)|act as (?:an? )?(?:unrestricted|unfiltered|jailbroken|different)|pretend (?:to be|you are)|roleplay as)\b[^.\n]{0,60}/gi,
    // Instruction override, beyond Veil's "ignore previous instructions".
    /\b(?:forget|ignore|disregard|override|bypass)\b[^.\n]{0,40}?\b(?:instructions|rules|guidelines|guardrails|policies|restrictions|directives|constraints|safety filters)\b/gi,
    /\b(?:forget|disregard|ignore)\s+(?:everything|all)\s+(?:above|before|prior|previous|you were told)\b/gi,
    // Exfiltration requests.
    /\b(?:send|post|upload|exfiltrate|leak|forward|transmit)\b[^.\n]{0,50}?\b(?:to|at)\s+https?:\/\/\S+/gi,
    /\b(?:reveal|print|show|dump|output|repeat|leak)\b[^.\n]{0,30}?\b(?:hidden|secret|internal|developer|initial|original)\s+(?:prompt|instructions|message|rules)\b/gi,
    // Encoded-instruction markers.
    /\b(?:base64|rot13|hex)[- ]?(?:decode|encoded|decoded)\b|\bdecode (?:this|the following)\b/gi,
  ].map(
    (pattern): SpanRule => ({
      category: "prompt_attack",
      pattern,
      score: () => 0.8,
      crossesPlaceholders: true,
    }),
  ),
];

const SECRET_SHAPES = new Set<ExposureSpanCategory>([
  "cloud_key",
  "url_credentials",
  "jwt",
  "hex_secret",
  "base64_secret",
]);

const ENTROPIC = new Set<ExposureSpanCategory>([
  "cloud_key",
  "jwt",
  "hex_secret",
  "base64_secret",
  "high_entropy_token",
]);

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function spanKey(span: ExposureSpan) {
  return `${span.start}:${span.end}:${span.category}:${span.score}`;
}

// Strongest first; then longest, earliest, and by category name, so the choice among
// overlapping candidates never depends on the order they were found in.
function byStrength(a: ExposureSpan, b: ExposureSpan) {
  return (
    b.score - a.score ||
    b.end - b.start - (a.end - a.start) ||
    a.start - b.start ||
    compareStrings(a.category, b.category)
  );
}

function byOffset(a: ExposureSpan, b: ExposureSpan) {
  return a.start - b.start || a.end - b.end || compareStrings(a.category, b.category);
}

/**
 * Candidates over the text with placeholders masked. A candidate may run across a
 * placeholder (an attack sentence around a redacted address); it is split around the
 * placeholder only when spans are reported.
 */
function maskedCandidates(text: string, tokens: Range[]): ExposureSpan[] {
  const masked = maskRedactionTokens(text, tokens);
  const unique = new Map<string, ExposureSpan>();

  for (const rule of SPAN_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of masked.matchAll(pattern)) {
      const value = rule.valueGroup ? match[rule.valueGroup] : match[0];
      if (!value) continue;
      if (!rule.crossesPlaceholders && tokens.length > 0 && value.includes(MASK)) continue;
      const end = (match.index ?? 0) + match[0].length;
      const start = end - value.length;
      const score = rule.score(value);
      if (score === null || score <= 0) continue;
      const span: ExposureSpan = { start, end, category: rule.category, score: round(score) };
      unique.set(spanKey(span), span);
    }
  }

  return [...unique.values()].sort(byOffset);
}

function splitAroundTokens(text: string, spans: ExposureSpan[], tokens: Range[]) {
  if (tokens.length === 0) return spans;
  return spans.flatMap((span) => withoutTokens(text, span, tokens));
}

/**
 * Every candidate span, before overlaps are resolved. No candidate covers any part of a
 * redaction token.
 */
export function exposureCandidates(text: string): ExposureSpan[] {
  const tokens = redactionTokenRanges(text);
  return splitAroundTokens(text, maskedCandidates(text, tokens), tokens).sort(byOffset);
}

// A Fenwick tree over the sorted distinct start offsets of the candidates, holding for
// the accepted spans both a count and the largest end offset. Each query and update is
// logarithmic.
class AcceptedSpans {
  private readonly starts: number[];
  private readonly count: Int32Array;
  private readonly maxEnd: Float64Array;

  constructor(starts: number[]) {
    this.starts = starts;
    this.count = new Int32Array(starts.length + 1);
    this.maxEnd = new Float64Array(starts.length + 1).fill(-1);
  }

  /** How many distinct candidate starts lie before `offset`. */
  private rank(offset: number) {
    let low = 0;
    let high = this.starts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.starts[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  private prefix(rank: number) {
    let count = 0;
    let maxEnd = -1;
    for (let index = rank; index > 0; index -= index & -index) {
      count += this.count[index];
      if (this.maxEnd[index] > maxEnd) maxEnd = this.maxEnd[index];
    }
    return { count, maxEnd };
  }

  /**
   * Accepted spans never overlap one another, so a span overlaps one of them exactly
   * when an accepted span starts inside it, or the accepted spans starting before it
   * reach past its start.
   */
  overlaps(span: ExposureSpan) {
    const before = this.prefix(this.rank(span.start));
    if (before.maxEnd > span.start) return true;
    return this.prefix(this.rank(span.end)).count > before.count;
  }

  add(span: ExposureSpan) {
    const size = this.starts.length;
    for (let index = this.rank(span.start) + 1; index <= size; index += index & -index) {
      this.count[index] += 1;
      if (span.end > this.maxEnd[index]) this.maxEnd[index] = span.end;
    }
  }
}

/**
 * Keeps the strongest candidate wherever candidates overlap: a sort by strength, then
 * one pass with logarithmic overlap queries, so O(n log n) in the number of candidates.
 */
export function resolveOverlaps(candidates: ExposureSpan[]) {
  const starts = [...new Set(candidates.map((span) => span.start))].sort((a, b) => a - b);
  const accepted = new AcceptedSpans(starts);
  const kept: ExposureSpan[] = [];
  for (const candidate of [...candidates].sort(byStrength)) {
    if (accepted.overlaps(candidate)) continue;
    accepted.add(candidate);
    kept.push(candidate);
  }
  return kept.sort(byOffset);
}

function countLog(candidates: ExposureSpan[], include: (span: ExposureSpan) => boolean) {
  return round(Math.log1p(candidates.filter(include).length));
}

export function extractExposureFeatures(input: ExposureInput): ExposureFeatureExtraction {
  const text = input.sanitizedText;
  const tokens = redactionTokenRanges(text);
  // Counted before splitting, so a placeholder inside a span does not count it twice.
  const candidates = maskedCandidates(text, tokens);
  const perThousand = text.length === 0 ? 0 : 1000 / text.length;
  const is = (category: ExposureSpanCategory) => (span: ExposureSpan) => span.category === category;

  const vector: ExposureFeatureVector = {
    max_span_score: candidates.reduce((max, span) => Math.max(max, span.score), 0),
    secret_shapes: countLog(candidates, (span) => SECRET_SHAPES.has(span.category)),
    assigned_secrets: countLog(candidates, is("assigned_secret")),
    high_entropy_tokens: countLog(candidates, is("high_entropy_token")),
    card_numbers: countLog(candidates, is("card_number")),
    network_identifiers: countLog(
      candidates,
      (span) => span.category === "ip_address" || span.category === "uuid",
    ),
    labelled_identifiers: countLog(candidates, is("labelled_identifier")),
    prompt_attacks: countLog(candidates, is("prompt_attack")),
    entropy_density: round(
      Math.min(
        1,
        (candidates.filter((span) => ENTROPIC.has(span.category)).length * perThousand) / 5,
      ),
    ),
    // Context only: heavy redaction says the text was sensitive, not that more remains.
    redaction_density: round(Math.min(1, (tokens.length * perThousand) / 20)),
  };

  return {
    featuresVersion: EXPOSURE_FEATURES_VERSION,
    vector,
    spans: splitAroundTokens(text, resolveOverlaps(candidates), tokens),
  };
}
