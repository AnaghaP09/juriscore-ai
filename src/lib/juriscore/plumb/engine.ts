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
}

function normalizeValue(value: PlumbValue) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : value;
}

export function compareClaims(authorities: PlumbClaim[], assertions: PlumbClaim[]): PlumbResult {
  const findings = assertions.map<PlumbFinding>((assertion) => {
    const candidates = authorities.filter((authority) => authority.subject === assertion.subject);
    if (candidates.length !== 1) {
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
    if ((authority.unit ?? null) !== (assertion.unit ?? null)) {
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

  return {
    verdict: counts.drifted > 0 ? "block" : counts.cannot_determine > 0 ? "revise" : "allow",
    findings,
    counts,
  };
}
