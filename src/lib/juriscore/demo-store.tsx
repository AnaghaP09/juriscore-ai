import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_ACTIVE_POLICY_IDS,
  type PolicyDefinition,
} from "@/lib/juriscore/policies/catalog";
import type { ValidationModule, ValidatorVerdict } from "@/lib/juriscore/core/contracts";

export type ModelId = "gemini-1.5-pro" | "claude-3.5-sonnet" | "gpt-4o";
export type DriftMode = "clean" | "drift";

export interface ModelMeta {
  id: ModelId;
  label: string;
  vendor: "Google" | "Anthropic" | "OpenAI";
  ctx: string;
  costPer1K: string;
  accent: string; // css color var
}

export const MODELS: ModelMeta[] = [
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", vendor: "Google", ctx: "2M ctx", costPer1K: "$0.0035", accent: "var(--chart-4)" },
  { id: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet", vendor: "Anthropic", ctx: "200K ctx", costPer1K: "$0.0030", accent: "var(--revise)" },
  { id: "gpt-4o", label: "GPT-4o", vendor: "OpenAI", ctx: "128K ctx", costPer1K: "$0.0050", accent: "var(--allow)" },
];

export interface GatewayRun {
  id: string;
  ts: string;
  model: ModelId;
  prompt: string;
  verdict: "allow" | "block" | "revise";
  tokens: { prompt: number; completion: number };
  latencyMs: number;
  ruleId?: string;
  stage?: string;
}

export interface SessionReceiptEntry {
  id: string;
  module: string;
  verdict: string;
  createdAt: string;
}

export interface VeilCheckRecord {
  verdict: ValidatorVerdict;
  occurrences: number;
  redacted: number;
  tokenized: number;
  chars: number;
}

export interface PlumbCheckRecord {
  verdict: ValidatorVerdict;
  assertions: number;
  matches: number;
  drifted: number;
  cannotDetermine: number;
}

interface LedgerDay {
  veil: {
    checks: number;
    allow: number;
    revise: number;
    block: number;
    occurrences: number;
    redacted: number;
    tokenized: number;
    chars: number;
  };
  plumb: {
    checks: number;
    allow: number;
    revise: number;
    block: number;
    assertions: number;
    matches: number;
    drifted: number;
    cannotDetermine: number;
  };
  receipts: number;
}

export interface LocalMetricsLedger {
  version: 1;
  simulated: boolean;
  days: Record<string, LedgerDay>;
}

// Fixed simulated seed (SPEC_OVERVIEW): internally consistent weekly numbers,
// present by default, evicted by the first real check.
export const SIMULATED_SEED = {
  veil: { checks: 126, occurrences: 1482, redacted: 1178, tokenized: 304, chars: 3_600_000 },
  plumb: { checks: 88, assertions: 412, matches: 354, drifted: 37, cannotDetermine: 21 },
  overall: { checks: 214, allow: 132, revise: 51, block: 31, receipts: 47 },
} as const;

const METRICS_STORAGE_KEY = "juriscore.localMetrics.v1";

const seededLedger = (): LocalMetricsLedger => ({ version: 1, simulated: true, days: {} });

const emptyDay = (): LedgerDay => ({
  veil: {
    checks: 0,
    allow: 0,
    revise: 0,
    block: 0,
    occurrences: 0,
    redacted: 0,
    tokenized: 0,
    chars: 0,
  },
  plumb: {
    checks: 0,
    allow: 0,
    revise: 0,
    block: 0,
    assertions: 0,
    matches: 0,
    drifted: 0,
    cannotDetermine: 0,
  },
  receipts: 0,
});

const utcDayKey = () => new Date().toISOString().slice(0, 10);

function pruneDays(days: Record<string, LedgerDay>): Record<string, LedgerDay> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(days).filter(([key]) => key >= cutoff));
}

export function summarizeTrailingWeek(ledger: LocalMetricsLedger) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const summary = emptyDay();
  for (const [key, day] of Object.entries(ledger.days)) {
    if (key < cutoff) continue;
    for (const field of Object.keys(summary.veil) as Array<keyof LedgerDay["veil"]>) {
      summary.veil[field] += day.veil[field];
    }
    for (const field of Object.keys(summary.plumb) as Array<keyof LedgerDay["plumb"]>) {
      summary.plumb[field] += day.plumb[field];
    }
    summary.receipts += day.receipts;
  }
  return summary;
}

interface DemoStore {
  activeModel: ModelId;
  setActiveModel: (m: ModelId) => void;
  killSwitch: boolean;
  setKillSwitch: (v: boolean) => void;
  driftMode: DriftMode;
  setDriftMode: (m: DriftMode) => void;
  recentRuns: GatewayRun[];
  pushRun: (r: GatewayRun) => void;
  activePolicyIds: string[];
  setPolicyActive: (policyId: string, active: boolean) => void;
  customPolicies: PolicyDefinition[];
  addCustomPolicy: (policy: PolicyDefinition) => void;
  localMetrics: LocalMetricsLedger;
  recordVeilCheck: (record: VeilCheckRecord) => void;
  recordPlumbCheck: (record: PlumbCheckRecord) => void;
  recordReceipt: (receipt: SessionReceiptEntry) => void;
  seedDemoMetrics: () => void;
  sessionReceipts: SessionReceiptEntry[];
  resetDemo: () => void;
}

const Ctx = createContext<DemoStore | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [activeModel, setActiveModel] = useState<ModelId>("gemini-1.5-pro");
  const [killSwitch, setKillSwitch] = useState(false);
  const [driftMode, setDriftMode] = useState<DriftMode>("clean");
  const [recentRuns, setRecentRuns] = useState<GatewayRun[]>([]);
  const [activePolicyIds, setActivePolicyIds] = useState<string[]>(DEFAULT_ACTIVE_POLICY_IDS);
  const [customPolicies, setCustomPolicies] = useState<PolicyDefinition[]>([]);
  const [localMetrics, setLocalMetrics] = useState<LocalMetricsLedger>(seededLedger);
  const [sessionReceipts, setSessionReceipts] = useState<SessionReceiptEntry[]>([]);

  useEffect(() => {
    try {
      const savedActive = window.localStorage.getItem("juriscore.activePolicyIds");
      const savedCustom = window.localStorage.getItem("juriscore.customPolicies");
      const savedMetrics = window.localStorage.getItem(METRICS_STORAGE_KEY);
      if (savedActive) setActivePolicyIds(JSON.parse(savedActive) as string[]);
      if (savedCustom) setCustomPolicies(JSON.parse(savedCustom) as PolicyDefinition[]);
      if (savedMetrics) {
        const parsed = JSON.parse(savedMetrics) as LocalMetricsLedger;
        if (parsed.version === 1) {
          setLocalMetrics({ ...parsed, days: pruneDays(parsed.days) });
        }
      }
    } catch {
      // Keep the built-in defaults when browser storage is unavailable or malformed.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("juriscore.activePolicyIds", JSON.stringify(activePolicyIds));
  }, [activePolicyIds]);

  useEffect(() => {
    window.localStorage.setItem("juriscore.customPolicies", JSON.stringify(customPolicies));
  }, [customPolicies]);

  useEffect(() => {
    window.localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(localMetrics));
  }, [localMetrics]);

  const pushRun = useCallback((r: GatewayRun) => {
    setRecentRuns((prev) => [r, ...prev].slice(0, 20));
  }, []);

  const setPolicyActive = useCallback((policyId: string, active: boolean) => {
    setActivePolicyIds((current) =>
      active
        ? [...new Set([...current, policyId])]
        : current.filter((id) => id !== policyId),
    );
  }, []);

  const addCustomPolicy = useCallback((policy: PolicyDefinition) => {
    setCustomPolicies((current) => [...current, policy]);
    setActivePolicyIds((current) => [...new Set([...current, policy.id])]);
  }, []);

  const mutateToday = useCallback((mutate: (day: LedgerDay) => void) => {
    setLocalMetrics((current) => {
      // The first real record evicts the simulated seed entirely.
      const days = current.simulated ? {} : { ...current.days };
      const key = utcDayKey();
      const day = structuredClone(days[key] ?? emptyDay());
      mutate(day);
      return { version: 1, simulated: false, days: { ...days, [key]: day } };
    });
  }, []);

  const recordVeilCheck = useCallback(
    (record: VeilCheckRecord) => {
      mutateToday((day) => {
        day.veil.checks += 1;
        day.veil[record.verdict] += 1;
        day.veil.occurrences += record.occurrences;
        day.veil.redacted += record.redacted;
        day.veil.tokenized += record.tokenized;
        day.veil.chars += record.chars;
      });
    },
    [mutateToday],
  );

  const recordPlumbCheck = useCallback(
    (record: PlumbCheckRecord) => {
      mutateToday((day) => {
        day.plumb.checks += 1;
        day.plumb[record.verdict] += 1;
        day.plumb.assertions += record.assertions;
        day.plumb.matches += record.matches;
        day.plumb.drifted += record.drifted;
        day.plumb.cannotDetermine += record.cannotDetermine;
      });
    },
    [mutateToday],
  );

  const recordReceipt = useCallback(
    (receipt: SessionReceiptEntry) => {
      mutateToday((day) => {
        day.receipts += 1;
      });
      setSessionReceipts((prev) => [receipt, ...prev].slice(0, 20));
    },
    [mutateToday],
  );

  const seedDemoMetrics = useCallback(() => {
    setLocalMetrics(seededLedger());
  }, []);

  const resetDemo = useCallback(() => {
    setKillSwitch(false);
    setDriftMode("clean");
    setRecentRuns([]);
    setActivePolicyIds(DEFAULT_ACTIVE_POLICY_IDS);
    setCustomPolicies([]);
    setLocalMetrics(seededLedger());
    setSessionReceipts([]);
  }, []);

  const value = useMemo(
    () => ({
      activeModel,
      setActiveModel,
      killSwitch,
      setKillSwitch,
      driftMode,
      setDriftMode,
      recentRuns,
      pushRun,
      activePolicyIds,
      setPolicyActive,
      customPolicies,
      addCustomPolicy,
      localMetrics,
      recordVeilCheck,
      recordPlumbCheck,
      recordReceipt,
      seedDemoMetrics,
      sessionReceipts,
      resetDemo,
    }),
    [
      activeModel,
      killSwitch,
      driftMode,
      recentRuns,
      pushRun,
      activePolicyIds,
      setPolicyActive,
      customPolicies,
      addCustomPolicy,
      localMetrics,
      recordVeilCheck,
      recordPlumbCheck,
      recordReceipt,
      seedDemoMetrics,
      sessionReceipts,
      resetDemo,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemoStore must be used within DemoStoreProvider");
  return c;
}

export function modelById(id: ModelId): ModelMeta {
  return MODELS.find((m) => m.id === id)!;
}
