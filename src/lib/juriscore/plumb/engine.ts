import type { EvidenceReference, ValidatorVerdict } from "../core/contracts";

export type PlumbStatus = "matches" | "drifted" | "cannot_determine";
export type PlumbValue = string | number | boolean;

export interface PlumbClaim {
  id: string;
  subject: string;
  value: PlumbValue;
  unit?: string;
  statement: string;
  reference: EvidenceReference;
}

export interface PlumbFinding {
  id: string;
  status: PlumbStatus;
  subject: string;
  reason: string;
  assertion: PlumbClaim;
  authority: PlumbClaim | null;
}

export interface PlumbResult {
  verdict: ValidatorVerdict;
  findings: PlumbFinding[];
  counts: Record<PlumbStatus, number>;
  policyIds: string[];
}

function normalizeValue(value: PlumbValue) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  // A value that arrived as text but is numerically or logically identical is not a
  // contradiction. Claim extraction routinely yields "25000" from prose where code
  // yields 25000, and reporting that as drift blocks a merge over sources that agree.
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  if (/^(?:true|false)$/i.test(trimmed)) return trimmed.toLocaleLowerCase() === "true";

  return trimmed.toLocaleLowerCase();
}

// Units are compared the way values are: case and surrounding space are formatting,
// not meaning, so "USD" and "usd" are one unit. An empty unit means no unit at all.
function normalizeUnit(unit: string | undefined) {
  const trimmed = unit?.trim().toLocaleLowerCase();
  return trimmed ? trimmed : null;
}

function valueKey(claim: PlumbClaim) {
  const value = normalizeValue(claim.value);
  return `${typeof value}:${String(value)}|${normalizeUnit(claim.unit) ?? ""}`;
}

export function compareClaims(
  authorities: PlumbClaim[],
  assertions: PlumbClaim[],
  options: { policyIds?: string[] } = {},
): PlumbResult {
  const findings = assertions.map<PlumbFinding>((assertion) => {
    const candidates = authorities.filter((authority) => authority.subject === assertion.subject);
    // Several sources stating the same value corroborate each other; only sources that
    // disagree leave the comparison genuinely ambiguous.
    const conflicting = new Set(candidates.map(valueKey)).size > 1;
    if (candidates.length === 0 || conflicting) {
      return {
        id: `plumb.${assertion.id}`,
        status: "cannot_determine",
        subject: assertion.subject,
        reason:
          candidates.length === 0
            ? "No authoritative source was supplied for this assertion."
            : "More than one authoritative value was supplied for this assertion.",
        assertion,
        authority: null,
      };
    }

    const authority = candidates[0];
    if (normalizeUnit(authority.unit) !== normalizeUnit(assertion.unit)) {
      return {
        id: `plumb.${assertion.id}`,
        status: "cannot_determine",
        subject: assertion.subject,
        reason: "The assertion and authoritative source use incompatible units.",
        assertion,
        authority,
      };
    }

    const matches = normalizeValue(authority.value) === normalizeValue(assertion.value);
    return {
      id: `plumb.${assertion.id}`,
      status: matches ? "matches" : "drifted",
      subject: assertion.subject,
      reason: matches
        ? "The assertion agrees with the authoritative source."
        : "The assertion contradicts the authoritative source.",
      assertion,
      authority,
    };
  });

  const counts: Record<PlumbStatus, number> = {
    matches: findings.filter((finding) => finding.status === "matches").length,
    drifted: findings.filter((finding) => finding.status === "drifted").length,
    cannot_determine: findings.filter((finding) => finding.status === "cannot_determine").length,
  };

  // A run that compared nothing has verified nothing, so it must not report "allow".
  const nothingCompared = findings.length === 0;

  return {
    verdict:
      counts.drifted > 0
        ? "block"
        : nothingCompared ||
            counts.cannot_determine > 0 ||
            (options.policyIds !== undefined && options.policyIds.length === 0)
          ? "revise"
          : "allow",
    findings,
    counts,
    policyIds: options.policyIds ?? [],
  };
}
