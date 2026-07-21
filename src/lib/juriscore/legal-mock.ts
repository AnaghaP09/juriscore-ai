// Deterministic mock data for legal operations views.
// Kept intentionally small and pure — no dates from Date.now(), so SSR is stable.
// Feeds the /dashboard operational cockpit (matters, leads, contracts, hearings,
// alerts) without touching the governance/AI mock in ./mock.ts.

export type LegalStatus =
  | "Urgent"
  | "Pending Review"
  | "Awaiting Client"
  | "Signed"
  | "Escalated"
  | "Scheduled"
  | "Draft";

export type MatterType =
  | "Litigation"
  | "M&A"
  | "Employment"
  | "IP"
  | "Regulatory"
  | "Contract";

export type AlertCategory = "Compliance" | "Deadline" | "Client" | "AI Review";

export interface Matter {
  id: string;               // e.g. "M-2041"
  client: string;
  title: string;
  type: MatterType;
  status: LegalStatus;
  owner: string;
  priority: 1 | 2 | 3;      // 1 = highest
  deadline: string;         // ISO date (day granularity)
  openedAt: string;         // ISO date
  unreadCount: number;
  documentCount: number;
  linkedContractIds: string[];
  summary: string;
  timeline: Array<{ ts: string; actor: string; event: string }>;
}

export interface Lead {
  id: string;
  client: string;
  intent: string;
  receivedAt: string;
  channel: "Web form" | "Referral" | "Email" | "Phone";
  matterType: MatterType;
}

export interface Contract {
  id: string;
  title: string;
  counterparty: string;
  status: LegalStatus;      // Draft | Pending Review | Awaiting Client | Signed | Escalated
  value: string;            // display string, e.g. "$1.2M"
  dueBy: string;            // ISO date
  owner: string;
}

export interface Hearing {
  id: string;
  matterId: string;
  client: string;
  forum: string;            // e.g. "SDNY Courtroom 14C"
  when: string;             // ISO datetime
  type: "Hearing" | "Deposition" | "Status Conf." | "Filing Deadline";
  owner: string;
}

export interface LegalAlert {
  id: string;
  category: AlertCategory;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  matterId?: string;
  ts: string;               // ISO
}

export interface AiReviewItem {
  id: string;               // reuses audit id when derived
  matterId: string;
  matterTitle: string;
  matterType: MatterType;
  owner: string;
  outcome: "revise" | "block" | "human_review";
  confidence: number;       // 0..1
  whyFlagged: string;
  recommendation: string;
  citationCoverage: number; // 0..1
  ts: string;
  auditId?: string;         // link into /dashboard/audit
}

// -----------------------------------------------------------------------------
// Seed data. Everything is deterministic; no clocks, no randomness at runtime.
// "Now" for the demo is 2026-07-21 (matches the current-date directive).
// -----------------------------------------------------------------------------

const OWNERS = [
  "R. Okafor (Partner)",
  "S. Duarte (Sr. Associate)",
  "J. Meyer (Associate)",
  "P. Ali (Legal Ops)",
  "K. Tanaka (Partner)",
];

export const MATTERS: Matter[] = [
  {
    id: "M-2041",
    client: "Northwind Capital",
    title: "SEC 10-Q disclosure review — Q2",
    type: "Regulatory",
    status: "Urgent",
    owner: OWNERS[0],
    priority: 1,
    deadline: "2026-07-22",
    openedAt: "2026-07-10",
    unreadCount: 4,
    documentCount: 18,
    linkedContractIds: ["C-8812"],
    summary:
      "Draft Q2 10-Q flagged by AI for two disclosure gaps around segment revenue. Partner sign-off required before filing window closes.",
    timeline: [
      { ts: "2026-07-21T09:12:00Z", actor: "JurisCore AI", event: "Flagged segment-revenue disclosure gap (§ Item 2)" },
      { ts: "2026-07-20T17:40:00Z", actor: OWNERS[1], event: "Uploaded revised MD&A draft v3" },
      { ts: "2026-07-19T11:05:00Z", actor: OWNERS[0], event: "Assigned matter, priority raised to Urgent" },
    ],
  },
  {
    id: "M-2039",
    client: "Helio Health",
    title: "HIPAA breach response — patient portal",
    type: "Regulatory",
    status: "Urgent",
    owner: OWNERS[4],
    priority: 1,
    deadline: "2026-07-24",
    openedAt: "2026-07-16",
    unreadCount: 2,
    documentCount: 11,
    linkedContractIds: [],
    summary:
      "Suspected unauthorized access to ~1,200 patient records. 60-day HHS notification clock running; drafting notice + client comms.",
    timeline: [
      { ts: "2026-07-20T14:22:00Z", actor: "JurisCore AI", event: "Suggested notice template; confidence 0.71 — human review required" },
      { ts: "2026-07-18T10:00:00Z", actor: OWNERS[3], event: "Initial forensic report received" },
    ],
  },
  {
    id: "M-2036",
    client: "Orbit Robotics",
    title: "Series C financing — definitive docs",
    type: "M&A",
    status: "Pending Review",
    owner: OWNERS[1],
    priority: 2,
    deadline: "2026-07-30",
    openedAt: "2026-07-01",
    unreadCount: 1,
    documentCount: 42,
    linkedContractIds: ["C-8790", "C-8791"],
    summary: "Definitive SPA & IRA out for partner review. Two open reps on IP ownership to resolve with target.",
    timeline: [
      { ts: "2026-07-19T09:00:00Z", actor: OWNERS[1], event: "Circulated redline v6 to opposing counsel" },
    ],
  },
  {
    id: "M-2033",
    client: "Meridian Foods",
    title: "Union grievance — line 4",
    type: "Employment",
    status: "Awaiting Client",
    owner: OWNERS[2],
    priority: 3,
    deadline: "2026-08-05",
    openedAt: "2026-06-28",
    unreadCount: 0,
    documentCount: 7,
    linkedContractIds: [],
    summary: "Awaiting client's position paper before responding to arbitrator.",
    timeline: [
      { ts: "2026-07-15T15:20:00Z", actor: OWNERS[2], event: "Sent position-paper template to client" },
    ],
  },
  {
    id: "M-2029",
    client: "Northwind Capital",
    title: "Vendor MSA — cloud infra",
    type: "Contract",
    status: "Pending Review",
    owner: OWNERS[3],
    priority: 2,
    deadline: "2026-07-25",
    openedAt: "2026-07-05",
    unreadCount: 3,
    documentCount: 9,
    linkedContractIds: ["C-8812"],
    summary: "MSA + DPA under review; AI flagged non-standard indemnity cap.",
    timeline: [
      { ts: "2026-07-20T11:10:00Z", actor: "JurisCore AI", event: "Flagged indemnity clause vs playbook §4.2" },
    ],
  },
  {
    id: "M-2024",
    client: "Aster Biotech",
    title: "Patent opposition — EP 3 214 887",
    type: "IP",
    status: "Escalated",
    owner: OWNERS[0],
    priority: 1,
    deadline: "2026-07-28",
    openedAt: "2026-06-12",
    unreadCount: 5,
    documentCount: 34,
    linkedContractIds: [],
    summary: "Opposition brief escalated after prior-art re-scoping; EPO deadline hard.",
    timeline: [
      { ts: "2026-07-20T08:44:00Z", actor: OWNERS[0], event: "Escalated to partner review" },
    ],
  },
];

export const LEADS: Lead[] = [
  { id: "L-551", client: "Kestrel Logistics", intent: "GDPR complaint response", receivedAt: "2026-07-21T08:02:00Z", channel: "Web form", matterType: "Regulatory" },
  { id: "L-550", client: "Vanta Payments", intent: "SaaS agreement review", receivedAt: "2026-07-20T18:44:00Z", channel: "Referral", matterType: "Contract" },
  { id: "L-549", client: "Grove & Ives", intent: "Employment dispute intake", receivedAt: "2026-07-20T12:11:00Z", channel: "Email", matterType: "Employment" },
  { id: "L-548", client: "Solstice Media", intent: "Trademark filing — Class 41", receivedAt: "2026-07-19T09:30:00Z", channel: "Web form", matterType: "IP" },
  { id: "L-547", client: "Halden Manufacturing", intent: "Vendor MSA drafting", receivedAt: "2026-07-18T15:05:00Z", channel: "Phone", matterType: "Contract" },
];

export const CONTRACTS: Contract[] = [
  { id: "C-8812", title: "Cloud infra MSA + DPA", counterparty: "AWS", status: "Awaiting Client", value: "$2.4M / 3y", dueBy: "2026-07-25", owner: OWNERS[3] },
  { id: "C-8791", title: "Series C SPA", counterparty: "Orbit Robotics", status: "Pending Review", value: "$80M", dueBy: "2026-07-30", owner: OWNERS[1] },
  { id: "C-8790", title: "Series C IRA", counterparty: "Orbit Robotics", status: "Pending Review", value: "—", dueBy: "2026-07-30", owner: OWNERS[1] },
  { id: "C-8785", title: "Distribution agreement", counterparty: "Nordics Retail Group", status: "Awaiting Client", value: "$4.1M / 2y", dueBy: "2026-07-23", owner: OWNERS[2] },
  { id: "C-8770", title: "Settlement agreement", counterparty: "J. Reyes", status: "Signed", value: "$220K", dueBy: "2026-07-18", owner: OWNERS[0] },
  { id: "C-8752", title: "NDA — diligence", counterparty: "Pinecrest Ventures", status: "Draft", value: "—", dueBy: "2026-07-27", owner: OWNERS[3] },
];

export const HEARINGS: Hearing[] = [
  { id: "H-401", matterId: "M-2024", client: "Aster Biotech", forum: "EPO oral hearing, Munich", when: "2026-07-22T09:00:00Z", type: "Hearing", owner: OWNERS[0] },
  { id: "H-402", matterId: "M-2041", client: "Northwind Capital", forum: "SEC pre-filing call", when: "2026-07-22T14:30:00Z", type: "Status Conf.", owner: OWNERS[0] },
  { id: "H-403", matterId: "M-2033", client: "Meridian Foods", forum: "AAA arbitration room 2", when: "2026-07-24T10:00:00Z", type: "Hearing", owner: OWNERS[2] },
  { id: "H-404", matterId: "M-2039", client: "Helio Health", forum: "HHS OCR intake call", when: "2026-07-25T13:00:00Z", type: "Status Conf.", owner: OWNERS[4] },
  { id: "H-405", matterId: "M-2036", client: "Orbit Robotics", forum: "Signing coordination", when: "2026-07-30T16:00:00Z", type: "Filing Deadline", owner: OWNERS[1] },
];

export const LEGAL_ALERTS: LegalAlert[] = [
  { id: "A-9001", category: "Deadline", severity: "high", title: "10-Q filing window closes in 24h", detail: "Matter M-2041 · Northwind Capital", matterId: "M-2041", ts: "2026-07-21T07:00:00Z" },
  { id: "A-9002", category: "AI Review", severity: "high", title: "Low-confidence AI draft needs human review", detail: "HIPAA breach notice · confidence 0.71", matterId: "M-2039", ts: "2026-07-20T14:22:00Z" },
  { id: "A-9003", category: "Compliance", severity: "medium", title: "New CFPB guidance published", detail: "Auto-monitoring surfaced 2 sections relevant to M-2029", matterId: "M-2029", ts: "2026-07-20T09:15:00Z" },
  { id: "A-9004", category: "Client", severity: "medium", title: "Client hasn't responded in 5 days", detail: "Meridian Foods · position paper pending", matterId: "M-2033", ts: "2026-07-20T08:00:00Z" },
  { id: "A-9005", category: "Deadline", severity: "medium", title: "Contract due in 2 days", detail: "C-8812 · Cloud infra MSA", ts: "2026-07-21T06:00:00Z" },
  { id: "A-9006", category: "AI Review", severity: "low", title: "Missing citation on drafted clause", detail: "Indemnity clause · playbook mapping incomplete", matterId: "M-2029", ts: "2026-07-19T16:40:00Z" },
];

// AI review queue — derived-shape items that would normally join with the audit log.
// Seeded here so the queue view is independent even if the audit mock changes shape.
export const AI_REVIEW: AiReviewItem[] = [
  {
    id: "AR-7701",
    matterId: "M-2039",
    matterTitle: "HIPAA breach response — patient portal",
    matterType: "Regulatory",
    owner: OWNERS[4],
    outcome: "human_review",
    confidence: 0.71,
    whyFlagged: "Draft notice omits specific HHS OCR reporting elements (§ 164.408).",
    recommendation: "Insert required breach-report fields; partner to sign off before send.",
    citationCoverage: 0.55,
    ts: "2026-07-20T14:22:00Z",
    auditId: "jc_00042",
  },
  {
    id: "AR-7702",
    matterId: "M-2029",
    matterTitle: "Vendor MSA — cloud infra",
    matterType: "Contract",
    owner: OWNERS[3],
    outcome: "revise",
    confidence: 0.83,
    whyFlagged: "Indemnity cap deviates from firm playbook §4.2 (2× fees → uncapped).",
    recommendation: "Revert to 2× fees cap or escalate for partner exception.",
    citationCoverage: 0.9,
    ts: "2026-07-20T11:10:00Z",
    auditId: "jc_00039",
  },
  {
    id: "AR-7703",
    matterId: "M-2041",
    matterTitle: "SEC 10-Q disclosure review — Q2",
    matterType: "Regulatory",
    owner: OWNERS[0],
    outcome: "block",
    confidence: 0.94,
    whyFlagged: "Draft disclosure omits segment revenue reconciliation required by SEC Reg S-K Item 303.",
    recommendation: "Do not file; add segment reconciliation table and re-run review.",
    citationCoverage: 1.0,
    ts: "2026-07-21T09:12:00Z",
    auditId: "jc_00051",
  },
  {
    id: "AR-7704",
    matterId: "M-2036",
    matterTitle: "Series C financing — definitive docs",
    matterType: "M&A",
    owner: OWNERS[1],
    outcome: "human_review",
    confidence: 0.62,
    whyFlagged: "IP-ownership rep language ambiguous vs. target's prior assignment history.",
    recommendation: "Confirm chain of title before accepting current rep language.",
    citationCoverage: 0.4,
    ts: "2026-07-19T09:00:00Z",
    auditId: "jc_00034",
  },
  {
    id: "AR-7705",
    matterId: "M-2024",
    matterTitle: "Patent opposition — EP 3 214 887",
    matterType: "IP",
    owner: OWNERS[0],
    outcome: "revise",
    confidence: 0.77,
    whyFlagged: "Prior-art citation missing for claim 3 obviousness argument.",
    recommendation: "Add EPO T-decision citation before submission.",
    citationCoverage: 0.66,
    ts: "2026-07-20T08:44:00Z",
    auditId: "jc_00028",
  },
];

// -----------------------------------------------------------------------------
// Derived helpers used by the priority strip + triage.
// -----------------------------------------------------------------------------

export const DEMO_TODAY = "2026-07-21";

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(bISO.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

export function isThisWeek(iso: string, todayISO = DEMO_TODAY): boolean {
  const d = daysBetween(todayISO, iso);
  return d >= 0 && d <= 6;
}

/** Priority strip counts. Pure, deterministic — safe to call during render. */
export function getPriorityCounts(todayISO = DEMO_TODAY) {
  const newLeads = LEADS.filter((l) => daysBetween(todayISO, l.receivedAt) >= -1).length;
  const urgentMatters = MATTERS.filter((m) => m.status === "Urgent" || m.status === "Escalated").length;
  const contractsAwaitingSig = CONTRACTS.filter(
    (c) => c.status === "Awaiting Client" || c.status === "Pending Review",
  ).length;
  const aiNeedsReview = AI_REVIEW.filter(
    (r) => r.outcome === "human_review" || r.confidence < 0.75 || r.citationCoverage < 0.6,
  ).length;
  const hearingsThisWeek = HEARINGS.filter((h) => isThisWeek(h.when, todayISO)).length;
  const monitoringAlerts = LEGAL_ALERTS.filter((a) => a.category === "Compliance" || a.severity === "high").length;
  return {
    newLeads,
    urgentMatters,
    contractsAwaitingSig,
    aiNeedsReview,
    hearingsThisWeek,
    monitoringAlerts,
  };
}

/**
 * Triage queue sorting.
 * 1. Urgent/Escalated first
 * 2. Then by priority (1 highest)
 * 3. Then by nearest deadline
 * 4. Tiebreak: more unread → higher
 */
export function getTriageQueue(): Matter[] {
  const statusRank: Record<LegalStatus, number> = {
    Urgent: 0,
    Escalated: 1,
    "Pending Review": 2,
    "Awaiting Client": 3,
    Scheduled: 4,
    Draft: 5,
    Signed: 6,
  };
  return [...MATTERS].sort((a, b) => {
    const s = statusRank[a.status] - statusRank[b.status];
    if (s !== 0) return s;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const d = a.deadline.localeCompare(b.deadline);
    if (d !== 0) return d;
    return b.unreadCount - a.unreadCount;
  });
}

/**
 * Default selected matter on first load:
 *  1. Highest-priority Urgent matter
 *  2. Else first item from the triage queue
 *  3. Else null (empty state)
 */
export function getDefaultSelectedMatter(): Matter | null {
  const queue = getTriageQueue();
  const urgent = queue.filter((m) => m.status === "Urgent").sort((a, b) => a.priority - b.priority);
  if (urgent[0]) return urgent[0];
  return queue[0] ?? null;
}
