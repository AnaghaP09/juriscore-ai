import { BUILT_IN_POLICIES, policyDomain, type PolicyDefinition } from "../policies/catalog";
import { decodePolicyVersion, encodedPolicyId } from "./receipts";

export const NO_POLICY_DOMAIN = "None";
export const REMOVED_POLICY_DOMAIN = "Custom (removed)";

/**
 * The distinct domains of the policies a receipt was checked under, derived from its
 * `policyVersion` against the current catalog. A custom policy that was deleted since the
 * receipt was made reads as "Custom (removed)" rather than failing.
 */
export function receiptDomains(
  policyVersion: string,
  customPolicies: PolicyDefinition[] = [],
): string[] {
  const refs = decodePolicyVersion(policyVersion);
  if (refs.length === 0) return [NO_POLICY_DOMAIN];
  const known = [...BUILT_IN_POLICIES, ...customPolicies];
  const domains = refs.map((ref) => {
    const policy = known.find((candidate) => encodedPolicyId(candidate.id) === ref.id);
    return policy ? policyDomain(policy) : REMOVED_POLICY_DOMAIN;
  });
  return [...new Set(domains)];
}

/** A resolver bound to the current custom policies, for filters and exports. */
export function receiptDomainResolver(customPolicies: PolicyDefinition[] = []) {
  const cache = new Map<string, string[]>();
  return (receipt: { policyVersion: string }) => {
    let domains = cache.get(receipt.policyVersion);
    if (!domains) {
      domains = receiptDomains(receipt.policyVersion, customPolicies);
      cache.set(receipt.policyVersion, domains);
    }
    return domains;
  };
}
