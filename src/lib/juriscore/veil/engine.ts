import type { ValidatorVerdict } from "../core/contracts";

export type VeilStrategy = "redact" | "tokenize";
export type VeilProfile = "healthcare" | "all_sensitive";
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
}

interface Detector {
  id: string;
  category: string;
  label: string;
  code: string;
  severity: VeilSeverity;
  scope: "common" | "healthcare" | "secrets";
  pattern: RegExp;
}

const DETECTORS: Detector[] = [
  {
    id: "veil.health.patient_name",
    category: "patient_name",
    label: "Labeled patient name",
    code: "PATIENT_NAME",
    severity: "high",
    scope: "healthcare",
    pattern:
      /\b(?:Patient Name|Patient|Name)[ \t]*:[ \t]*[A-Z][A-Za-z'-]+(?:[ \t]+[A-Z][A-Za-z'-]+){1,3}\b/gi,
  },
  {
    id: "veil.health.date_of_birth",
    category: "date_of_birth",
    label: "Labeled date of birth",
    code: "DOB",
    severity: "high",
    scope: "healthcare",
    pattern:
      /\b(?:DOB|Date of Birth)\s*[:\-]\s*(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/gi,
  },
  {
    id: "veil.health.mrn",
    category: "medical_record_number",
    label: "Medical record number",
    code: "MRN",
    severity: "high",
    scope: "healthcare",
    pattern: /\bMRN\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi,
  },
  {
    id: "veil.health.member_id",
    category: "insurance_member_id",
    label: "Insurance member ID",
    code: "MEMBER_ID",
    severity: "high",
    scope: "healthcare",
    pattern: /\b(?:Member|Insurance)\s+ID\s*[:#-]?\s*[A-Z0-9-]{5,}\b/gi,
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
    pattern: /\b(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/g,
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
    id: "veil.secret.payment_card",
    category: "payment_card",
    label: "Payment card number",
    code: "PAYMENT_CARD",
    severity: "high",
    scope: "secrets",
    pattern: /\b(?:\d[ -]*?){13,16}\b/g,
  },
];

function detectorApplies(detector: Detector, profile: VeilProfile) {
  if (detector.scope === "common") return true;
  if (profile === "all_sensitive") return true;
  return detector.scope === "healthcare";
}

function cloneGlobal(pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

export function protectText(
  text: string,
  options: { strategy?: VeilStrategy; profile?: VeilProfile } = {},
): VeilResult {
  const strategy = options.strategy ?? "redact";
  const profile = options.profile ?? "healthcare";
  const findings: VeilFinding[] = [];
  let sanitizedText = text;

  for (const detector of DETECTORS.filter((item) => detectorApplies(item, profile))) {
    const replacements: string[] = [];
    const tokensByValue = new Map<string, string>();
    let count = 0;
    sanitizedText = sanitizedText.replace(cloneGlobal(detector.pattern), (matchedValue) => {
      count += 1;
      let replacement = `[REDACTED_${detector.code}]`;
      if (strategy === "tokenize") {
        replacement =
          tokensByValue.get(matchedValue) ?? `[${detector.code}_${tokensByValue.size + 1}]`;
        tokensByValue.set(matchedValue, replacement);
      }
      replacements.push(replacement);
      return replacement;
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
  const rawVerdict: ValidatorVerdict = hasHighSeverity
    ? "block"
    : findings.length > 0
      ? "revise"
      : "allow";

  return {
    sanitizedText,
    findings,
    rawVerdict,
    sanitizedVerdict: "allow",
    requiresReview: findings.length > 0,
    profile,
    strategy,
  };
}
