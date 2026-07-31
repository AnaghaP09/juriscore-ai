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

  useEffect(() => {
    try {
      const savedActive = window.localStorage.getItem("juriscore.activePolicyIds");
      const savedCustom = window.localStorage.getItem("juriscore.customPolicies");
      if (savedActive) setActivePolicyIds(JSON.parse(savedActive) as string[]);
      if (savedCustom) setCustomPolicies(JSON.parse(savedCustom) as PolicyDefinition[]);
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

  const resetDemo = useCallback(() => {
    setKillSwitch(false);
    setDriftMode("clean");
    setRecentRuns([]);
    setActivePolicyIds(DEFAULT_ACTIVE_POLICY_IDS);
    setCustomPolicies([]);
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
