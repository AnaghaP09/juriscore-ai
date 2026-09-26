import type { ValidatorVerdict } from "../core/contracts";
import type { VeilPolicyScope } from "../policies/catalog";

export type VeilStrategy = "redact" | "tokenize";
export type VeilProfile = "saas_operations" | "healthcare" | "all_sensitive";
export type VeilSeverity = "high" | "medium";

export interface VeilFinding {
  id: string;
  detectorId: string;
  category: string;
  label: string;
  count: number;
  severity: VeilSeverity;
  replacements: string[];
}

export interface VeilResult {
  sanitizedText: string;
  findings: VeilFinding[];
  rawVerdict: ValidatorVerdict;
  sanitizedVerdict: ValidatorVerdict;
  requiresReview: boolean;
  profile: VeilProfile;
  strategy: VeilStrategy;
  policyIds: string[];
}

interface Detector {
  id: string;
  category: string;
  label: string;
  code: string;
  severity: VeilSeverity;
  scope: VeilPolicyScope;
  pattern: RegExp;
  valueGroup?: number;
  /**
   * Replace the match exactly as found. The word-boundary guard exists for short values
   * that could sit inside a longer token; a PEM block starts and ends with dashes, and a
   * guard there would leave a block that happens to touch a letter unredacted.
   */
  unguarded?: boolean;
}

/** Detector id for a PEM private-key header with no matching footer. */
export const UNTERMINATED_PRIVATE_KEY_DETECTOR = "veil.secret.private_key_unterminated";

// PDF and DOCX extraction flattens a table row into a label, a column gap, and the value
// ("Patient Name   Maya Patel"), so a labelled field reaches the engine without its colon.
// Accept a punctuation separator, a two-space column gap, or the single tab that DOCX cell
// boundaries produce; a single space stays unmatched so prose does not trip a detector.
const LABEL_SEPARATOR = "(?:[ \\t]*[:-][ \\t]*|[ \\t]{2,}|\\t)";

function labelledPattern(source: string) {
  return new RegExp(source.replace(/<sep>/g, LABEL_SEPARATOR), "gi");
}

const DETECTORS: Detector[] = [
  // Private keys run first and are redacted as a whole block, header to footer. Matching
  // the header alone left every body line in the sanitized text, and a later detector
  // could rewrite part of the body before the block was recognised.
  {
    id: "veil.secret.private_key",
    category: "private_key",
    label: "Private key material",
    code: "PRIVATE_KEY",
    severity: "high",
    scope: "secrets",
    pattern:
      /-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY( BLOCK)?-----[\s\S]*?-----END \1PRIVATE KEY\2-----/g,
    unguarded: true,
  },
  {
    // A header whose footer never arrives (a truncated paste) cannot be bounded, so
    // everything from the header to the end of the text is withheld.
    id: UNTERMINATED_PRIVATE_KEY_DETECTOR,
    category: "private_key",
    label: "Unterminated private key",
    code: "PRIVATE_KEY_PARTIAL",
    severity: "high",
    scope: "secrets",
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*/g,
    unguarded: true,
  },
  {
    id: "veil.health.patient_name",
    category: "patient_name",
    label: "Patient name",
    code: "PATIENT_NAME",
    severity: "high",
    scope: "healthcare",
    pattern: labelledPattern(
      "\\b(?:Patient Name|Patient|Name)<sep>([A-Z][A-Za-z'-]+(?:[ \\t]+[A-Z][A-Za-z'-]+){1,3})\\b",
    ),
    valueGroup: 1,
  },
  {
    id: "veil.health.date_of_birth",
    category: "date_of_birth",
    label: "Date of birth",
    code: "DOB",
    severity: "high",
    scope: "healthcare",
    pattern: labelledPattern(
      "\\b(?:DOB|Date of Birth)<sep>((?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}))\\b",
    ),
    valueGroup: 1,
  },
  {
    id: "veil.health.mrn",
    category: "medical_record_number",
    label: "Medical record number",
    code: "MRN",
    severity: "high",
    scope: "healthcare",
    pattern: /\bMRN\b[ \t]*[:#-]?[ \t]*([A-Z0-9-]{4,})\b/gi,
    valueGroup: 1,
  },
  {
    id: "veil.health.member_id",
    category: "insurance_member_id",
    label: "Insurance member ID",
    code: "MEMBER_ID",
    severity: "high",
    scope: "healthcare",
    pattern: /\b(?:Member|Insurance)[ \t]+ID\b[ \t]*[:#-]?[ \t]*([A-Z0-9-]{5,})\b/gi,
    valueGroup: 1,
  },
  {
    id: "veil.common.ssn",
    category: "ssn",
    label: "Social Security number",
    code: "SSN",
    severity: "high",
    scope: "common",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  // Remittance blocks on invoices and statements. These run before the generic
  // email/phone detectors so a labelled value is consumed with its label intact.
  {
    id: "veil.finance.routing_number",
    category: "routing_number",
    label: "Bank routing number",
    code: "ROUTING",
    severity: "high",
    scope: "common",
    pattern: /\b(?:ABA|RTN|Routing(?:[ \t]*(?:Number|No\.?|#))?)\b[ \t]*[:#-]?[ \t]*(\d{9})\b/gi,
    valueGroup: 1,
  },
  {
    id: "veil.finance.bank_account",
    category: "bank_account",
    label: "Bank account number",
    code: "BANK_ACCOUNT",
    severity: "high",
    scope: "common",
    pattern: labelledPattern(
      "\\b(?:Bank[ \\t]+Account|Account(?:[ \\t]+(?:Number|No\\.?|#))?|Acct\\.?(?:[ \\t]+(?:Number|No\\.?|#))?)<sep>([A-Z0-9][A-Za-z0-9-]{3,})\\b",
    ),
    valueGroup: 1,
  },
  {
    id: "veil.finance.lockbox",
    category: "bank_account",
    label: "Lockbox number",
    code: "LOCKBOX",
    severity: "high",
    scope: "common",
    pattern: /\bLockbox\b[ \t]*[:#-]?[ \t]*([A-Z0-9][A-Za-z0-9-]{2,})\b/gi,
    valueGroup: 1,
  },
  {
    id: "veil.finance.iban",
    category: "iban",
    label: "IBAN",
    code: "IBAN",
    severity: "high",
    scope: "common",
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
  },
  {
    id: "veil.finance.swift_bic",
    category: "swift_bic",
    label: "SWIFT / BIC code",
    code: "SWIFT",
    severity: "high",
    scope: "common",
    // Label matched case-sensitively: invoices write it uppercase, and a loose match
    // would swallow the next ordinary word after a sentence containing "swift".
    pattern:
      /\b(?:SWIFT|BIC)(?:[ \t]*\/[ \t]*BIC)?(?:[ \t]+Code)?\b[ \t]*[:#-]?[ \t]*([A-Z]{4}[A-Z0-9]{2,7})\b/g,
    valueGroup: 1,
  },
  {
    id: "veil.identity.tax_id",
    category: "tax_id",
    label: "Tax identification number",
    code: "TAX_ID",
    severity: "high",
    scope: "common",
    pattern: labelledPattern(
      "\\b(?:Tax[ \\t]*(?:ID|Identification(?:[ \\t]+Number)?)|EIN|VAT(?:[ \\t]+(?:ID|Number|No\\.?))?|GSTIN|TIN)<sep>([A-Z0-9][A-Za-z0-9-]{3,})\\b",
    ),
    valueGroup: 1,
  },
  {
    id: "veil.identity.postal_address",
    category: "postal_address",
    label: "Street address",
    code: "ADDRESS",
    severity: "medium",
    scope: "common",
    // Case-sensitive: a street name is capitalised, which keeps "36 consultant hours"
    // and similar quantity-plus-noun phrases out of the match.
    pattern:
      /\b\d{1,6}[ \t]+(?:[A-Z][A-Za-z.'-]*[ \t]+){0,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Plaza|Plz|Crescent|Cres|Way|Terrace|Ter|Place|Pl|Parkway|Pkwy|Circle|Cir|Square|Sq|Highway|Hwy)\.?(?:[ \t]*,?[ \t]*(?:Suite|Ste|Apt|Unit|Floor|Fl|Rm|Room|#)\.?[ \t]*[A-Za-z0-9-]+)?/g,
  },
  {
    id: "veil.identity.postal_locality",
    category: "postal_locality",
    label: "City, state, and ZIP",
    code: "LOCALITY",
    severity: "medium",
    scope: "common",
    // Redacting the street line alone still leaves a locality precise enough to
    // re-identify, which HIPAA Safe Harbor treats as an identifier in its own right.
    pattern:
      /\b[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,3},[ \t]*(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|P[AR]|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])[ \t]+\d{5}(?:-\d{4})?\b/g,
  },
  {
    id: "veil.identity.contact_name",
    category: "contact_name",
    label: "Named contact",
    code: "CONTACT_NAME",
    severity: "medium",
    scope: "common",
    pattern: labelledPattern(
      "\\b(?:Attn|Attention|Contact(?:[ \\t]+Name)?|Account[ \\t]+Manager|Customer[ \\t]+Success[ \\t]+Lead|Sales[ \\t]+Rep(?:resentative)?|Prepared[ \\t]+By|Authori[sz]ed[ \\t]+By|Signed[ \\t]+By|Billing[ \\t]+Contact|Project[ \\t]+Manager)<sep>([A-Z][A-Za-z'-]+(?:[ \\t]+[A-Z][A-Za-z'-]+){1,3})\\b",
    ),
    valueGroup: 1,
  },
  {
    id: "veil.common.email",
    category: "email",
    label: "Email address",
    code: "EMAIL",
    severity: "medium",
    scope: "common",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: "veil.common.phone",
    category: "phone",
    label: "Phone number",
    code: "PHONE",
    severity: "medium",
    scope: "common",
    // Leading lookbehind rather than \b: a number that starts with "(" has no word
    // boundary before it, which silently skipped every "(415) 555-0199".
    pattern: /(?<![A-Za-z0-9])(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/g,
  },
  {
    id: "veil.secret.openai_key",
    category: "api_key",
    label: "API key",
    code: "API_KEY",
    severity: "high",
    scope: "secrets",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    id: "veil.secret.aws_key",
    category: "aws_access_key",
    label: "AWS access key",
    code: "AWS_KEY",
    severity: "high",
    scope: "secrets",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: "veil.secret.database_url",
    category: "database_url",
    label: "Database connection URL",
    code: "DB_URL",
    severity: "high",
    scope: "secrets",
    pattern: /\b(?:postgres|mysql):\/\/[^\s"']+/g,
  },
  {
    id: "veil.secret.bearer_token",
    category: "bearer_token",
    label: "Bearer token",
    code: "BEARER_TOKEN",
    severity: "high",
    scope: "secrets",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/gi,
  },
  {
    id: "veil.secret.github_token",
    category: "github_token",
    label: "GitHub token",
    code: "GITHUB_TOKEN",
    severity: "high",
    scope: "secrets",
    pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{16,}\b/g,
  },
  {
    id: "veil.saas.tenant_id",
    category: "tenant_id",
    label: "Customer tenant ID",
    code: "TENANT_ID",
    severity: "medium",
    scope: "secrets",
    pattern: /\b(?:tenant|workspace|account)[ _-]?id\s*[:=]\s*([A-Za-z0-9_-]{6,})\b/gi,
    valueGroup: 1,
  },
  {
    id: "veil.ai.prompt_override",
    category: "prompt_injection",
    label: "Prompt override instruction",
    code: "PROMPT_OVERRIDE",
    severity: "high",
    scope: "prompt_security",
    pattern:
      /\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system)\s+instructions\b/gi,
  },
  {
    id: "veil.ai.system_prompt_request",
    category: "system_prompt_extraction",
    label: "System prompt extraction request",
    code: "SYSTEM_PROMPT_REQUEST",
    severity: "high",
    scope: "prompt_security",
    pattern: /\b(?:reveal|print|show|extract)\s+(?:the\s+)?system\s+prompt\b/gi,
  },
  {
    id: "veil.secret.payment_card",
    category: "payment_card",
    label: "Payment card number",
    code: "PAYMENT_CARD",
    severity: "high",
    scope: "secrets",
    pattern: /\b(?:\d[ -]*?){13,16}\b/g,
  },
];

function detectorApplies(
  detector: Detector,
  profile: VeilProfile,
  policyScopes: VeilPolicyScope[],
) {
  if (detector.scope === "common") return true;
  if (profile === "all_sensitive") return true;
  if (policyScopes.includes(detector.scope)) return true;
  if (profile === "healthcare") return detector.scope === "healthcare";
  return detector.scope === "secrets" || detector.scope === "prompt_security";
}

function cloneGlobal(pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface VeilProtectOptions {
  strategy?: VeilStrategy;
  profile?: VeilProfile;
  policyIds?: string[];
  policyScopes?: VeilPolicyScope[];
}

export function protectText(text: string, options: VeilProtectOptions = {}): VeilResult {
  const strategy = options.strategy ?? "redact";
  const profile = options.profile ?? "saas_operations";
  const policyIds = options.policyIds ?? [];
  const policyScopes = options.policyScopes ?? [];
  const findings: VeilFinding[] = [];
  let sanitizedText = text;

  for (const detector of DETECTORS.filter((item) => detectorApplies(item, profile, policyScopes))) {
    const replacements: string[] = [];
    const values = Array.from(sanitizedText.matchAll(cloneGlobal(detector.pattern)))
      .map((match) => match[detector.valueGroup ?? 0])
      .filter((value): value is string => Boolean(value));
    const uniqueValues = [...new Map(values.map((value) => [value.toLowerCase(), value])).values()];
    let count = 0;

    uniqueValues.forEach((value, index) => {
      const replacement =
        strategy === "tokenize" ? `[${detector.code}_${index + 1}]` : `[REDACTED_${detector.code}]`;
      const flags = detector.pattern.flags.includes("i") ? "gi" : "g";
      // Guard both ends: a detected value is replaced everywhere it stands on its own,
      // but never where it happens to sit inside a longer token. Without this, a short
      // value such as a lockbox "00027" also overwrites the middle of an unrelated tax
      // ID ("SAMPLE-94-0002718"), mangling the output and double-counting the receipt.
      const escaped = escapeRegularExpression(value);
      sanitizedText = sanitizedText.replace(
        new RegExp(
          detector.unguarded ? escaped : `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`,
          flags,
        ),
        () => {
          count += 1;
          replacements.push(replacement);
          return replacement;
        },
      );
    });

    if (count > 0) {
      findings.push({
        id: `${detector.id}.${findings.length + 1}`,
        detectorId: detector.id,
        category: detector.category,
        label: detector.label,
        count,
        severity: detector.severity,
        replacements,
      });
    }
  }

  const hasHighSeverity = findings.some((finding) => finding.severity === "high");
  const hasPromptAttack = findings.some((finding) =>
    ["prompt_injection", "system_prompt_extraction"].includes(finding.category),
  );
  const rawVerdict: ValidatorVerdict = hasHighSeverity
    ? "block"
    : findings.length > 0
      ? "revise"
      : "allow";

  return {
    sanitizedText,
    findings,
    rawVerdict,
    sanitizedVerdict: hasPromptAttack ? "revise" : "allow",
    requiresReview: findings.length > 0,
    profile,
    strategy,
    policyIds,
  };
}

declare const veilSanitizedBrand: unique symbol;

/**
 * Text (or a request built only from such text) that has passed `sanitizeForProvider`.
 * Provider adapters accept nothing else, so an unscanned string cannot reach transport
 * without a cast that review would see.
 */
export type VeilSanitized<T> = T & { readonly [veilSanitizedBrand]: true };

export type ProviderSanitization =
  | { blocked: false; text: VeilSanitized<string>; result: VeilResult }
  | { blocked: true; reason: string; result: VeilResult };

const ALL_SCOPES: VeilPolicyScope[] = ["common", "healthcare", "secrets", "prompt_security"];
const PRIVATE_KEY_MARKER = /-----(?:BEGIN|END) (?:[A-Z0-9]+ )*PRIVATE KEY/;

/**
 * The gate in front of every provider request. It protects the text under the caller's
 * policies, then re-scans the result under every detector: anything still detectable,
 * an unterminated private key, or any leftover PEM marker fails closed. The verdicts in
 * `result` are Veil's and are never changed here.
 */
export function sanitizeForProvider(
  text: string,
  options: VeilProtectOptions = {},
): ProviderSanitization {
  const result = protectText(text, options);
  const unterminated = result.findings.some(
    (finding) => finding.detectorId === UNTERMINATED_PRIVATE_KEY_DETECTOR,
  );
  if (unterminated) {
    return {
      blocked: true,
      reason: "An unterminated private key was found. Nothing was sent.",
      result,
    };
  }
  if (PRIVATE_KEY_MARKER.test(result.sanitizedText)) {
    return {
      blocked: true,
      reason: "Private key material remains after protection. Nothing was sent.",
      result,
    };
  }
  const residual = protectText(result.sanitizedText, {
    strategy: "redact",
    profile: "all_sensitive",
    policyScopes: ALL_SCOPES,
  });
  if (residual.findings.length > 0) {
    const labels = [...new Set(residual.findings.map((finding) => finding.label))].join(", ");
    return {
      blocked: true,
      reason: `Sensitive data remains after protection (${labels}). Nothing was sent.`,
      result,
    };
  }
  return { blocked: false, text: result.sanitizedText as VeilSanitized<string>, result };
}
