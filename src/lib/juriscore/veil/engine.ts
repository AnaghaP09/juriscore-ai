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
}

const DETECTORS: Detector[] = [
  {
    id: "veil.health.patient_name",
    category: "patient_name",
    label: "Patient name",
    code: "PATIENT_NAME",
    severity: "high",
    scope: "healthcare",
    pattern:
      /\b(?:Patient Name|Patient|Name)[ \t]*:[ \t]*([A-Z][A-Za-z'-]+(?:[ \t]+[A-Z][A-Za-z'-]+){1,3})\b/gi,
    valueGroup: 1,
  },
  {
    id: "veil.health.date_of_birth",
    category: "date_of_birth",
    label: "Date of birth",
    code: "DOB",
    severity: "high",
    scope: "healthcare",
    pattern:
      /\b(?:DOB|Date of Birth)[ \t]*[:-][ \t]*((?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}))\b/gi,
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
    id: "veil.secret.private_key",
    category: "private_key",
    label: "Private key material",
    code: "PRIVATE_KEY",
    severity: "high",
    scope: "secrets",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
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

export function protectText(
  text: string,
  options: {
    strategy?: VeilStrategy;
    profile?: VeilProfile;
    policyIds?: string[];
    policyScopes?: VeilPolicyScope[];
  } = {},
): VeilResult {
  const strategy = options.strategy ?? "redact";
  const profile = options.profile ?? "saas_operations";
  const policyIds = options.policyIds ?? [];
  const policyScopes = options.policyScopes ?? [];
  const findings: VeilFinding[] = [];
  let sanitizedText = text;

  for (const detector of DETECTORS.filter((item) =>
    detectorApplies(item, profile, policyScopes),
  )) {
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
      sanitizedText = sanitizedText.replace(
        new RegExp(escapeRegularExpression(value), flags),
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
