import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  BUILT_IN_POLICIES,
  DEFAULT_ACTIVE_POLICY_IDS,
  type PolicyDefinition,
  type PolicyFeature,
} from "@/lib/juriscore/policies/catalog";

function searchableText(policy: PolicyDefinition) {
  return [
    policy.id,
    policy.name,
    policy.shortName,
    policy.authority,
    policy.description,
    policy.version,
    policy.source.title,
    policy.source.publisher,
    ...policy.veilScopes,
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function score(policy: PolicyDefinition, terms: string[]) {
  const haystack = searchableText(policy);
  return terms.filter((term) => haystack.includes(term)).length;
}

function describe(policy: PolicyDefinition) {
  return {
    id: policy.id,
    name: policy.name,
    shortName: policy.shortName,
    version: policy.version,
    authority: policy.authority,
    description: policy.description,
    features: policy.features,
    veilScopes: policy.veilScopes,
    activeByDefault: policy.defaultActive,
    source: policy.source,
  };
}

export interface RetrievePolicyArgs {
  query: string;
  feature?: PolicyFeature;
  limit?: number;
}

export function runRetrievePolicy({ query, feature, limit = 3 }: RetrievePolicyArgs) {
  const candidates = feature
    ? BUILT_IN_POLICIES.filter((policy) => policy.features.includes(feature))
    : BUILT_IN_POLICIES;
  const terms = [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2),
    ),
  ];
  const ranked = candidates
    .map((policy) => ({ policy, score: score(policy, terms) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.policy.defaultActive) - Number(a.policy.defaultActive) ||
        a.policy.id.localeCompare(b.policy.id),
    )
    .slice(0, limit);

  return {
    matched: ranked.length > 0,
    policies: ranked.map((entry) => describe(entry.policy)),
    catalogIds: candidates.map((policy) => policy.id),
    defaultActivePolicyIds: DEFAULT_ACTIVE_POLICY_IDS,
    note:
      ranked.length > 0
        ? "Packs translate published references into JurisCore checks. They do not reproduce restricted standards, determine legal applicability, or certify compliance."
        : "No pack in the catalog matched this query. `catalogIds` lists every pack available in this instance.",
  };
}

export default defineTool({
  name: "retrieve_policy",
  title: "Retrieve policy packs",
  description:
    "Look up JurisCore policy packs from the instance catalog: the PII and sensitive-data baseline, HIPAA Privacy Rule reference, SOC 2 Trust Services Criteria reference, MITRE ATLAS, NIST AI RMF with the Generative AI Profile, and NIST CSF 2.0. Returns each pack's id, version, issuing authority, the Veil scopes it activates, and its source title, publisher, URL, and retrieval date. Packs translate published references into product checks; they do not reproduce restricted standards, determine legal applicability, or certify compliance. Pass the returned ids to `check_prompt`, `compare_claims`, or `evaluate_response`.",
  inputSchema: {
    query: z
      .string()
      .min(1)
      .describe(
        "What you are trying to govern, for example 'health identifiers' or 'prompt attacks'.",
      ),
    feature: z
      .enum(["veil", "plumb"])
      .optional()
      .describe(
        "Restrict to packs that apply to Veil input protection or Plumb source validation.",
      ),
    limit: z.number().int().min(1).max(10).default(3),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, feature, limit }) => {
    const result = runRetrievePolicy({ query, feature, limit });
    return {
      content: [
        {
          type: "text",
          text: result.matched
            ? `${result.policies.length} pack(s): ${result.policies.map((policy) => `${policy.id} (${policy.version})`).join(", ")}.`
            : `No pack matched. Catalog: ${result.catalogIds.join(", ")}.`,
        },
      ],
      structuredContent: result,
    };
  },
});
