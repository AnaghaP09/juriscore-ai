import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

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
  resetDemo: () => void;
}

const Ctx = createContext<DemoStore | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [activeModel, setActiveModel] = useState<ModelId>("gemini-1.5-pro");
  const [killSwitch, setKillSwitch] = useState(false);
  const [driftMode, setDriftMode] = useState<DriftMode>("clean");
  const [recentRuns, setRecentRuns] = useState<GatewayRun[]>([]);

  const pushRun = useCallback((r: GatewayRun) => {
    setRecentRuns((prev) => [r, ...prev].slice(0, 20));
  }, []);

  const resetDemo = useCallback(() => {
    setKillSwitch(false);
    setDriftMode("clean");
    setRecentRuns([]);
  }, []);

  const value = useMemo(
    () => ({ activeModel, setActiveModel, killSwitch, setKillSwitch, driftMode, setDriftMode, recentRuns, pushRun, resetDemo }),
    [activeModel, killSwitch, driftMode, recentRuns, pushRun, resetDemo],
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
