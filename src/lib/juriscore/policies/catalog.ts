export type PolicyFeature = "veil" | "plumb";
export type VeilPolicyScope = "common" | "healthcare" | "secrets" | "prompt_security";

export interface PolicySource {
  title: string;
  publisher: string;
  url: string;
  retrievedAt: string;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  shortName: string;
  version: string;
  authority: string;
  description: string;
  features: PolicyFeature[];
  veilScopes: VeilPolicyScope[];
  defaultActive: boolean;
  custom?: boolean;
  source: PolicySource;
}

export const BUILT_IN_POLICIES: PolicyDefinition[] = [
  {
    id: "pii-baseline",
    name: "PII & sensitive-data baseline",
    shortName: "PII baseline",
    version: "JurisCore 2026.07",
    authority: "JurisCore mapping based on NIST Privacy Framework",
    description:
      "A practical baseline for personal identifiers, credentials, secrets, and customer data. PII is a data category, not one universal regulation.",
    features: ["veil", "plumb"],
    veilScopes: ["common", "secrets"],
    defaultActive: true,
    source: {
      title: "NIST Privacy Framework 1.0",
      publisher: "National Institute of Standards and Technology",
      url: "https://csrc.nist.gov/pubs/cswp/10/nist-privacy-framework-version-10/final",
      retrievedAt: "2026-07-31",
    },
  },
  {
    id: "hipaa-privacy",
    name: "HIPAA Privacy & de-identification reference",
    shortName: "HIPAA",
    version: "45 CFR Parts 160 and 164",
    authority: "U.S. Department of Health and Human Services",
    description:
      "Adds protected-health-information detectors and minimum-necessary review prompts for applicable covered-entity or business-associate workflows.",
    features: ["veil", "plumb"],
    veilScopes: ["common", "healthcare"],
    defaultActive: false,
    source: {
      title: "The HIPAA Privacy Rule",
      publisher: "HHS Office for Civil Rights",
      url: "https://www.hhs.gov/hipaa/for-professionals/privacy/index.html",
      retrievedAt: "2026-07-31",
    },
  },
  {
    id: "soc2-tsc",
    name: "SOC 2 Trust Services Criteria reference",
    shortName: "SOC 2",
    version: "2017 TSC with March 2020 updates",
    authority: "AICPA",
    description:
      "Maps input protection and evidence traceability to the security, availability, processing integrity, confidentiality, and privacy criteria.",
    features: ["veil", "plumb"],
    veilScopes: ["common", "secrets"],
    defaultActive: true,
    source: {
      title: "2017 Trust Services Criteria, TSP Section 100",
      publisher: "American Institute of Certified Public Accountants",
      url: "https://us.aicpa.org/content/dam/aicpa/interestareas/frc/assuranceadvisoryservices/downloadabledocuments/trust-services-criteria-redlined.pdf",
      retrievedAt: "2026-07-31",
    },
  },
  {
    id: "mitre-atlas",
    name: "MITRE ATLAS AI threat reference",
    shortName: "MITRE ATLAS",
    version: "Living knowledge base · accessed 2026-07-31",
    authority: "MITRE",
    description:
      "Adds prompt-attack and credential-exposure checks informed by adversary tactics and techniques for AI-enabled systems.",
    features: ["veil", "plumb"],
    veilScopes: ["secrets", "prompt_security"],
    defaultActive: true,
    source: {
      title: "MITRE ATLAS",
      publisher: "MITRE",
      url: "https://atlas.mitre.org/",
      retrievedAt: "2026-07-31",
    },
  },
  {
    id: "nist-ai-rmf",
    name: "NIST AI RMF + Generative AI Profile",
    shortName: "NIST AI RMF",
    version: "AI RMF 1.0 + NIST AI 600-1",
    authority: "National Institute of Standards and Technology",
    description:
      "Applies govern, map, measure, and manage expectations with GenAI-specific privacy, information-integrity, and security review controls.",
    features: ["veil", "plumb"],
    veilScopes: ["common", "secrets", "prompt_security"],
    defaultActive: true,
    source: {
      title: "Artificial Intelligence Risk Management Framework: Generative AI Profile",
      publisher: "National Institute of Standards and Technology",
      url: "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence",
      retrievedAt: "2026-07-31",
    },
  },
  {
    id: "nist-csf-2",
    name: "NIST Cybersecurity Framework 2.0",
    shortName: "NIST CSF 2.0",
    version: "NIST CSWP 29 · 2024",
    authority: "National Institute of Standards and Technology",
    description:
      "Adds cybersecurity governance, protection, detection, response, and recovery context for AI-enabled SaaS workflows.",
    features: ["veil", "plumb"],
    veilScopes: ["secrets", "prompt_security"],
    defaultActive: false,
    source: {
      title: "The NIST Cybersecurity Framework 2.0",
      publisher: "National Institute of Standards and Technology",
      url: "https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20",
      retrievedAt: "2026-07-31",
    },
  },
];

export const DEFAULT_ACTIVE_POLICY_IDS = BUILT_IN_POLICIES.filter(
  (policy) => policy.defaultActive,
).map((policy) => policy.id);

export function policyById(id: string, customPolicies: PolicyDefinition[] = []) {
  return [...BUILT_IN_POLICIES, ...customPolicies].find((policy) => policy.id === id);
}

export function policiesForFeature(
  policyIds: string[],
  feature: PolicyFeature,
  customPolicies: PolicyDefinition[] = [],
) {
  return policyIds
    .map((id) => policyById(id, customPolicies))
    .filter((policy): policy is PolicyDefinition => Boolean(policy?.features.includes(feature)));
}

export function veilScopesForPolicies(
  policyIds: string[],
  customPolicies: PolicyDefinition[] = [],
) {
  return [
    ...new Set(
      policiesForFeature(policyIds, "veil", customPolicies).flatMap(
        (policy) => policy.veilScopes,
      ),
    ),
  ];
}
