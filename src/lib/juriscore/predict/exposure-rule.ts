import { luhnValid, redactionTokenRanges, shannonEntropy } from "./exposure-features";

/**
 * The heuristic residual rule: a fixed, deterministic reference point for the
 * residual-exposure model. It runs on exactly the sanitized text the model sees, and
 * flags it when any of four plain rules still fires after Veil has done its work.
 *
 * It is advisory like the model: it never changes what Veil decided, and only its flag and
 * rule ids are ever recorded (never the text it matched).
 */

export const RESIDUAL_RULE_VERSION = "residual-rule.v1";

export const RESIDUAL_RULE_IDS = [
  "high_entropy_token",
  "credential_assignment",
  "prompt_attack_phrase",
  "card_like_number",
] as const;

export type ResidualRuleId = (typeof RESIDUAL_RULE_IDS)[number];

/** Plain-language names for the product UI. */
export const RESIDUAL_RULE_LABEL: Record<ResidualRuleId, string> = {
  high_entropy_token: "long random-looking token",
  credential_assignment: "credential assignment (e.g. api_key=…)",
  prompt_attack_phrase: "prompt-attack phrase",
  card_like_number: "card-like number",
};

/**
 * The fixed prompt-attack phrase list. It is deliberately short and literal: the rule is
 * a baseline to compare the model against, not a detector to extend.
 */
export const PROMPT_ATTACK_PHRASES: readonly RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+(?:instructions|rules|prompts?)\b/i,
  /\bdisregard\s+(?:the\s+|your\s+)?(?:system\s+prompt|previous\s+instructions|instructions)\b/i,
  /\byou\s+are\s+now\b/i,
  /\breveal\s+(?:your\s+|the\s+)?(?:system\s+)?prompt\b/i,
  /\bdeveloper\s+mode\b/i,
];

const CREDENTIAL_ASSIGNMENT =
  /(?:password|passwd|secret|token|api[_-]?key|credential)\s*[:=]\s*(\S{8,})/gi;
const TOKEN = /[A-Za-z0-9+/_\-.=]{20,}/g;
const DIGIT_RUN = /(?<!\d)\d{13,19}(?!\d)/g;

export interface ResidualRuleMatch {
  rule: ResidualRuleId;
  start: number;
  end: number;
}

export interface ResidualRuleResult {
  version: typeof RESIDUAL_RULE_VERSION;
  flagged: boolean;
  /** Rules that fired, in RESIDUAL_RULE_IDS order, each once. */
  ruleIds: ResidualRuleId[];
  /** Where each rule fired, sorted by offset. Offsets only; the text is never kept. */
  matches: ResidualRuleMatch[];
}

function insideAny(start: number, end: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((range) => start < range.end && end > range.start);
}

export function residualRuleCheck(sanitizedText: string): ResidualRuleResult {
  const text = sanitizedText;
  const tokens = redactionTokenRanges(text);
  const matches: ResidualRuleMatch[] = [];
  const add = (rule: ResidualRuleId, start: number, end: number) => {
    if (!insideAny(start, end, tokens)) matches.push({ rule, start, end });
  };

  // 1. A long, high-entropy token with both letters and digits.
  for (const match of text.matchAll(TOKEN)) {
    const value = match[0];
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) continue;
    if (shannonEntropy(value) < 3.5) continue;
    add("high_entropy_token", match.index ?? 0, (match.index ?? 0) + value.length);
  }

  // 2. A credential assignment whose value is still present.
  for (const match of text.matchAll(CREDENTIAL_ASSIGNMENT)) {
    const start = match.index ?? 0;
    add("credential_assignment", start, start + match[0].length);
  }

  // 3. A known prompt-attack phrase.
  for (const phrase of PROMPT_ATTACK_PHRASES) {
    const match = phrase.exec(text);
    if (match) add("prompt_attack_phrase", match.index, match.index + match[0].length);
  }

  // 4. A 13 to 19 digit run that passes the Luhn check.
  for (const match of text.matchAll(DIGIT_RUN)) {
    if (!luhnValid(match[0])) continue;
    const start = match.index ?? 0;
    add("card_like_number", start, start + match[0].length);
  }

  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  const fired = new Set(matches.map((match) => match.rule));
  const ruleIds = RESIDUAL_RULE_IDS.filter((id) => fired.has(id));
  return { version: RESIDUAL_RULE_VERSION, flagged: ruleIds.length > 0, ruleIds, matches };
}

export type RuleAgreement = "agree" | "model-flags-more" | "rule-flags-more";

/** Plain-language agreement between the model's band and the rule, for the Veil card. */
export const RULE_AGREEMENT_LABEL: Record<RuleAgreement, string> = {
  agree: "Model and rule agree",
  "model-flags-more": "Model flags more than the rule",
  "rule-flags-more": "Rule flags something the model rated low",
};

/**
 * The model "flags" when its band is uncertain or high. A rule hit the model rated low is
 * the case worth a human look, so it is reported separately.
 */
export function ruleAgreement(
  modelBand: "low" | "uncertain" | "high",
  ruleFlagged: boolean,
): RuleAgreement {
  const modelFlags = modelBand !== "low";
  if (modelFlags === ruleFlagged) return "agree";
  return modelFlags ? "model-flags-more" : "rule-flags-more";
}

export function isResidualRuleId(value: unknown): value is ResidualRuleId {
  return typeof value === "string" && (RESIDUAL_RULE_IDS as readonly string[]).includes(value);
}
