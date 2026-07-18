// Deterministic mock data for JurisCore AI demo.
// Shared by the dashboard UI and MCP tools so both stay consistent.

export type Domain = "finance" | "healthcare";
export type Verdict = "allow" | "block" | "revise";
export type Stage = "input_guardrail" | "policy_retrieval" | "output_guardrail" | "citation";

export interface PolicyClause {
  id: string;
  domain: Domain;
  rulebook: string;
  title: string;
  snippet: string;
}

export interface AuditEntry {
  id: string;
  ts: string; // ISO
  domain: Domain;
  useCase: string;
  tool: string;
  verdict: Verdict;
  latencyMs: number;
  blockedStage?: Stage;
  reason?: string;
  prompt: string;
  retrievedPolicyIds: string[];
  draftResponse: string;
  citationCoverage: number; // 0..1
  finalResponse: string | null;
}

export interface UseCaseSummary {
  key: string;
  domain: Domain;
  name: string;
  regulatoryDriver: string;
  failureMode: string;
  volume: number;
  blockRate: number;
  citationCoverage: number;
  topFailureMode: string;
}

export interface Rulebook {
  id: string;
  domain: Domain;
  name: string;
  agency: string;
  docCount: number;
  clauseCount: number;
  lastUpdated: string;
  coverage: number; // 0..1
  status: "active" | "draft";
}

// --- Deterministic RNG ---
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260717);
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

// --- Rulebooks & clauses ---
export const RULEBOOKS: Rulebook[] = [
  { id: "sec", domain: "finance", name: "SEC Marketing & Disclosure", agency: "U.S. SEC", docCount: 42, clauseCount: 318, lastUpdated: "2026-06-14", coverage: 0.94, status: "active" },
  { id: "finra", domain: "finance", name: "FINRA Communications", agency: "FINRA", docCount: 27, clauseCount: 194, lastUpdated: "2026-05-30", coverage: 0.91, status: "active" },
  { id: "hipaa", domain: "healthcare", name: "HIPAA Privacy & Security", agency: "HHS OCR", docCount: 61, clauseCount: 452, lastUpdated: "2026-07-02", coverage: 0.96, status: "active" },
  { id: "cms-pa", domain: "healthcare", name: "CMS Prior Authorization Transparency", agency: "CMS", docCount: 18, clauseCount: 87, lastUpdated: "2026-04-11", coverage: 0.82, status: "active" },
  { id: "eu-ai-act", domain: "finance", name: "EU AI Act — High-Risk Systems", agency: "European Commission", docCount: 9, clauseCount: 63, lastUpdated: "2026-06-28", coverage: 0.71, status: "draft" },
];

export const POLICIES: PolicyClause[] = [
  { id: "SEC-206(4)-1", domain: "finance", rulebook: "sec", title: "Investment Adviser Marketing Rule", snippet: "Any advertisement must not contain untrue statements of material fact or omit material facts." },
  { id: "SEC-10b-5", domain: "finance", rulebook: "sec", title: "Anti-fraud disclosure", snippet: "It is unlawful to make any untrue statement of a material fact in connection with a security." },
  { id: "FINRA-2210", domain: "finance", rulebook: "finra", title: "Communications with the Public", snippet: "All member communications must be fair, balanced, and provide a sound basis for evaluating facts." },
  { id: "FINRA-2111", domain: "finance", rulebook: "finra", title: "Suitability", snippet: "A recommendation must be suitable given the customer's investment profile." },
  { id: "HIPAA-164.502", domain: "healthcare", rulebook: "hipaa", title: "Minimum Necessary Standard", snippet: "Use or disclose only the minimum PHI necessary to accomplish the intended purpose." },
  { id: "HIPAA-164.514", domain: "healthcare", rulebook: "hipaa", title: "De-identification of PHI", snippet: "PHI must be de-identified using Safe Harbor or Expert Determination methods before disclosure." },
  { id: "HIPAA-164.308", domain: "healthcare", rulebook: "hipaa", title: "Administrative Safeguards", snippet: "Covered entities must perform periodic risk analysis and management of PHI systems." },
  { id: "CMS-PA-2026-01", domain: "healthcare", rulebook: "cms-pa", title: "AI-influenced coverage disclosure", snippet: "Insurers must disclose when an AI system was used to influence a coverage determination." },
  { id: "EU-AIA-Art14", domain: "finance", rulebook: "eu-ai-act", title: "Human Oversight", snippet: "High-risk AI systems must be designed to be effectively overseen by natural persons." },
];

// --- Use cases (from the PRD) ---
const USE_CASES: Omit<UseCaseSummary, "volume" | "blockRate" | "citationCoverage" | "topFailureMode">[] = [
  { key: "denial-mgmt", domain: "healthcare", name: "Denial Management & Appeals Generation", regulatoryDriver: "CMS Prior Authorization Transparency", failureMode: "Cites wrong payer policy or untraceable denial reason" },
  { key: "ambient-coding", domain: "healthcare", name: "Ambient Clinical Documentation → Medical Coding", regulatoryDriver: "HIPAA Security Rule risk-analysis", failureMode: "Under/over-coding; PHI leaked in ungoverned scribing pipeline" },
  { key: "adviser-marketing", domain: "finance", name: "Adviser Marketing Copy Review", regulatoryDriver: "SEC Marketing Rule 206(4)-1", failureMode: "Unsubstantiated performance claim reaches client" },
  { key: "kyc-summarization", domain: "finance", name: "KYC / AML Case Summarization", regulatoryDriver: "FINRA + BSA/AML", failureMode: "PII leakage into downstream analytics; missing citations" },
  { key: "suitability-check", domain: "finance", name: "Retail Suitability Explanations", regulatoryDriver: "FINRA 2111", failureMode: "Recommendation not backed by client profile evidence" },
  { key: "prior-auth", domain: "healthcare", name: "Prior Authorization Drafting", regulatoryDriver: "CMS-0057-F", failureMode: "AI-generated determination lacks clinical citation" },
];

const TOOLS = ["evaluate_response", "check_prompt", "retrieve_policy", "enforce_citations"];

const REASONS_BY_STAGE: Record<Stage, string[]> = {
  input_guardrail: ["PII detected in prompt (SSN)", "PHI (patient MRN) present", "Jailbreak attempt detected", "Restricted concept: material non-public information"],
  policy_retrieval: ["No matching policy clause above similarity threshold", "Cross-domain policy leak"],
  output_guardrail: ["Restricted concept: unhedged performance claim", "Toxic content flagged"],
  citation: ["Uncited claim in response", "Citation points to non-approved source", "Fabricated policy reference"],
};

const SAMPLE_PROMPTS: Record<Domain, string[]> = {
  finance: [
    "Draft a client email highlighting our fund's 3-year outperformance vs benchmark.",
    "Summarize this KYC file for the AML analyst: John Doe SSN 123-45-6789...",
    "Explain why product X is suitable for retiree client Mary A.",
  ],
  healthcare: [
    "Generate an appeal letter for denial code CO-197 for patient MRN 887421.",
    "Assign ICD-10 codes from this ambient scribe transcript.",
    "Draft a prior auth request for MRI lumbar spine, patient history attached.",
  ],
};

// --- Generate audit entries ---
function generateAudit(): AuditEntry[] {
  const entries: AuditEntry[] = [];
  const now = Date.now();
  const days = 30;
  const total = 512;
  for (let i = 0; i < total; i++) {
    const uc = USE_CASES[Math.floor(rand() * USE_CASES.length)];
    const ts = new Date(now - Math.floor(rand() * days * 24 * 3600 * 1000)).toISOString();
    const roll = rand();
    const verdict: Verdict = roll < 0.07 ? "block" : roll < 0.13 ? "revise" : "allow";
    const stage: Stage | undefined = verdict === "allow" ? undefined : (pick(["input_guardrail", "output_guardrail", "citation", "policy_retrieval"]) as Stage);
    const policies = POLICIES.filter((p) => p.domain === uc.domain);
    const retrieved = [pick(policies).id, pick(policies).id].filter((v, idx, arr) => arr.indexOf(v) === idx);
    const prompt = pick(SAMPLE_PROMPTS[uc.domain]);
    const coverage = verdict === "allow" ? 0.85 + rand() * 0.15 : verdict === "revise" ? 0.4 + rand() * 0.4 : rand() * 0.4;
    entries.push({
      id: `jc_${(i + 1).toString().padStart(5, "0")}`,
      ts,
      domain: uc.domain,
      useCase: uc.key,
      tool: pick(TOOLS),
      verdict,
      latencyMs: Math.round(180 + rand() * 620),
      blockedStage: stage,
      reason: stage ? pick(REASONS_BY_STAGE[stage]) : undefined,
      prompt,
      retrievedPolicyIds: retrieved,
      draftResponse: verdict === "block"
        ? "[blocked before generation]"
        : `Draft response referencing ${retrieved.join(", ")}. ${uc.name} output.`,
      citationCoverage: Number(coverage.toFixed(2)),
      finalResponse: verdict === "block" ? null : `Approved response citing ${retrieved.join(", ")}.`,
    });
  }
  return entries.sort((a, b) => b.ts.localeCompare(a.ts));
}

export const AUDIT: AuditEntry[] = generateAudit();

// --- Derived metrics ---
export function getMetrics() {
  const total = AUDIT.length;
  const blocked = AUDIT.filter((a) => a.verdict === "block").length;
  const revised = AUDIT.filter((a) => a.verdict === "revise").length;
  const allowed = total - blocked - revised;
  const avgLatency = Math.round(AUDIT.reduce((s, a) => s + a.latencyMs, 0) / total);
  const avgCoverage = AUDIT.reduce((s, a) => s + a.citationCoverage, 0) / total;

  // Time-series: requests per day
  const byDay: Record<string, { day: string; allowed: number; blocked: number; revised: number }> = {};
  for (const a of AUDIT) {
    const day = a.ts.slice(0, 10);
    byDay[day] ??= { day, allowed: 0, blocked: 0, revised: 0 };
    byDay[day][a.verdict === "allow" ? "allowed" : a.verdict === "block" ? "blocked" : "revised"]++;
  }
  const series = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));

  const byDomain = (["finance", "healthcare"] as Domain[]).map((d) => {
    const items = AUDIT.filter((a) => a.domain === d);
    return {
      domain: d,
      total: items.length,
      blocked: items.filter((a) => a.verdict === "block").length,
    };
  });

  const blockedByStage: Record<Stage, number> = {
    input_guardrail: 0,
    policy_retrieval: 0,
    output_guardrail: 0,
    citation: 0,
  };
  for (const a of AUDIT) if (a.blockedStage) blockedByStage[a.blockedStage]++;

  return {
    kpis: {
      totalRequests: total,
      violationRate: blocked / total,
      allowedRate: allowed / total,
      revisedRate: revised / total,
      avgLatencyMs: avgLatency,
      guardrailAccuracy: 0.973, // target metric
      auditPrepMinutes: 4, // target: minutes not days
      timeToShipDaysBefore: 47,
      timeToShipDaysAfter: 6,
      citationCoverage: avgCoverage,
    },
    series,
    byDomain,
    blockedByStage,
  };
}

export function getUseCaseSummaries(): UseCaseSummary[] {
  return USE_CASES.map((uc) => {
    const items = AUDIT.filter((a) => a.useCase === uc.key);
    const blocked = items.filter((a) => a.verdict === "block").length;
    const coverage = items.reduce((s, a) => s + a.citationCoverage, 0) / (items.length || 1);
    const stageCounts: Record<string, number> = {};
    items.forEach((a) => {
      if (a.reason) stageCounts[a.reason] = (stageCounts[a.reason] || 0) + 1;
    });
    const top = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? uc.failureMode;
    return {
      ...uc,
      volume: items.length,
      blockRate: items.length ? blocked / items.length : 0,
      citationCoverage: Number(coverage.toFixed(2)),
      topFailureMode: top,
    };
  });
}

// --- Guardrail helpers used by MCP tools ---
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{3}-\d{2}-\d{4}\b/, "SSN"],
  [/\bMRN[\s:]*\d{4,}\b/i, "Patient MRN"],
  [/\b\d{16}\b/, "Credit card number"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, "Email address"],
];

export function scanPrompt(prompt: string, domain: Domain) {
  const findings: { type: string; severity: "high" | "medium" }[] = [];
  for (const [rx, type] of PII_PATTERNS) if (rx.test(prompt)) findings.push({ type, severity: "high" });
  if (/ignore (all )?previous|system prompt/i.test(prompt)) findings.push({ type: "Prompt injection", severity: "high" });
  if (domain === "healthcare" && /patient|diagnosis|prescription/i.test(prompt) && !findings.length) {
    findings.push({ type: "PHI-adjacent content — apply Minimum Necessary", severity: "medium" });
  }
  return { verdict: findings.some((f) => f.severity === "high") ? "block" : "allow", findings };
}

export function retrievePolicies(query: string, domain: Domain, limit = 3) {
  const scored = POLICIES.filter((p) => p.domain === domain).map((p) => {
    const q = query.toLowerCase();
    let score = 0;
    for (const w of p.snippet.toLowerCase().split(/\s+/)) if (q.includes(w) && w.length > 4) score += 1;
    for (const w of p.title.toLowerCase().split(/\s+/)) if (q.includes(w) && w.length > 4) score += 2;
    return { ...p, score: score + rand() * 0.5 };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function enforceCitations(response: string, allowedPolicyIds: string[]) {
  const cited = allowedPolicyIds.filter((id) => response.includes(id));
  const orphanClaims = response.split(/[.!?]/).filter((s) => /must|required|shall|prohibited/i.test(s) && !allowedPolicyIds.some((id) => s.includes(id)));
  const coverage = cited.length / Math.max(allowedPolicyIds.length, 1);
  return {
    verdict: orphanClaims.length > 0 || coverage < 0.5 ? "revise" : "allow",
    citedPolicies: cited,
    uncitedClaims: orphanClaims.map((c) => c.trim()).filter(Boolean),
    coverage: Number(coverage.toFixed(2)),
  };
}
