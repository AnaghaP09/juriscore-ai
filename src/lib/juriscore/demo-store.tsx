import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_ACTIVE_POLICY_IDS, type PolicyDefinition } from "@/lib/juriscore/policies/catalog";
import type {
  DriftRiskBand,
  ValidationModule,
  ValidatorVerdict,
} from "@/lib/juriscore/core/contracts";
import { GatewayHttpError, gatewayClient, needsUnlock } from "@/lib/juriscore/gateway/client";
import type { GatewayRunStatus, GatewayStatus } from "@/lib/juriscore/gateway/protocol";
import {
  addPrediction,
  checkDayKey,
  emptyDay,
  mutateLedgerDay,
  stampCheck,
  normalizeLedger,
  recordPlumbCheckInLedger,
  RISK_BANDS,
  type LedgerDay,
  type LocalMetricsLedger,
  type PlumbCheckRecord,
  type StampedPlumbCheck,
} from "@/lib/juriscore/metrics-ledger";

export type DriftMode = "clean" | "drift";

/** A completed gateway run, text-free: no prompt, no reply, no detected value. */
export interface GatewayRun {
  receiptId: string;
  ts: string;
  model: string;
  status: GatewayRunStatus;
  verdict: ValidatorVerdict;
  latencyMs: number;
}

/**
 * What the browser knows about the server-side gateway. Everything here comes from the
 * server; "Connected" is shown only when `status.connections[model].state` says so.
 */
export type GatewayView =
  | { phase: "loading" }
  | { phase: "unavailable"; reason: "disabled" | "token-missing" | "error"; message?: string }
  | { phase: "locked"; expired: boolean }
  | { phase: "ready"; status: GatewayStatus };

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
  /** Advisory residual-exposure score (0 to 100) of the sanitized text, if it was scored. */
  exposureScore?: number | null;
  exposureBand?: DriftRiskBand | null;
}

export type { PlumbCheckRecord, LocalMetricsLedger };

// Fixed simulated seed (SPEC_OVERVIEW): internally consistent weekly numbers,
// present by default, evicted by the first real check.
export const SIMULATED_SEED = {
  veil: { checks: 126, occurrences: 1482, redacted: 1178, tokenized: 304, chars: 3_600_000 },
  plumb: { checks: 88, assertions: 412, matches: 354, drifted: 37, cannotDetermine: 21 },
  overall: { checks: 214, allow: 132, revise: 51, block: 31, receipts: 47 },
  // Per-tool verdict splits; they sum to each tool's checks and to the overall split.
  veilOutcomes: { allow: 70, revise: 36, block: 20 },
  plumbOutcomes: { allow: 62, revise: 15, block: 11 },
  plumbRisk: {
    counts: { low: 52, uncertain: 24, high: 12 },
    latest: { score: 38, band: "uncertain" },
  },
} as const;

const METRICS_STORAGE_KEY = "juriscore.localMetrics.v1";
// Plumb sources (the diff and every document's extracted text) live in memory only, so a
// reload always starts Plumb from zero and no document text is left in the browser. Earlier
// builds saved them under these keys; they are deleted on load.
const LEGACY_SOURCE_STORAGE_KEYS = ["juriscore.plumbRepository.v1", "juriscore.plumbDocuments.v1"];

const seededLedger = (): LocalMetricsLedger => ({
  version: 1,
  simulated: true,
  days: {},
  latestRisk: null,
  recentPredictions: [],
});

const utcDayKey = () => new Date().toISOString().slice(0, 10);

function pruneDays(days: Record<string, LedgerDay>): Record<string, LedgerDay> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(days).filter(([key]) => key >= cutoff));
}

/**
 * The "Last 7 days" window: seven UTC calendar days, today and the six dates before it.
 * Dates after today are excluded.
 */
export function trailingWeekRange(now = new Date()) {
  const newest = now.toISOString().slice(0, 10);
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
  const oldest = new Date(Date.parse(newest) - sixDaysMs).toISOString().slice(0, 10);
  return { oldest, newest };
}

export function summarizeTrailingWeek(ledger: LocalMetricsLedger, now = new Date()) {
  const { oldest, newest } = trailingWeekRange(now);
  const summary = emptyDay();
  for (const [key, day] of Object.entries(ledger.days)) {
    if (key < oldest || key > newest) continue;
    for (const field of Object.keys(summary.veil) as Array<keyof LedgerDay["veil"]>) {
      summary.veil[field] += day.veil[field];
    }
    for (const field of Object.keys(summary.plumb) as Array<keyof LedgerDay["plumb"]>) {
      if (field === "risk") continue;
      summary.plumb[field] += day.plumb[field];
    }
    for (const band of RISK_BANDS) summary.plumb.risk[band] += day.plumb.risk?.[band] ?? 0;
    summary.receipts += day.receipts;
  }
  return summary;
}

/** A repository the user connected so Plumb can read a real pull request from it. */
export interface ConnectedRepository {
  /** Null when a diff was pasted without naming a repository, which is allowed. */
  owner: string | null;
  repo: string | null;
  pullNumber: number | null;
  /** The unified diff, however it arrived: pasted by hand or fetched from GitHub. */
  diff: string;
  /** Name to show when the content is a whole file rather than a diff. */
  sourcePath?: string;
  origin: "pasted" | "fetched";
  loadedAt: string;
}

/**
 * A document uploaded on the Plumb side. Only the extracted text is kept — the file
 * itself never leaves the browser and is not stored.
 */
export interface SourceDocument {
  id: string;
  name: string;
  kind: string;
  text: string;
  /**
   * Retained only so documents stored before policies applied uniformly still parse.
   * Every document is now scanned under every active pack.
   */
  policyId?: string;
  uploadedAt: string;
}

interface DemoStore {
  /** A model id from the server allowlist; empty until gateway status has loaded. */
  activeModel: string;
  setActiveModel: (modelId: string) => void;
  gateway: GatewayView;
  /** Model ids with a connection check in flight. */
  checkingModels: string[];
  refreshGateway: () => Promise<void>;
  /** Returns an error message, or null when the gateway was unlocked. */
  unlockGateway: (token: string) => Promise<string | null>;
  verifyGatewayModel: (modelId: string) => Promise<void>;
  /** Called when a gateway request answers 401: reopens the Unlock dialog. */
  markGatewayLocked: (expired: boolean) => void;
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
  updateCustomPolicy: (policy: PolicyDefinition) => void;
  removeCustomPolicy: (policyId: string) => void;
  localMetrics: LocalMetricsLedger;
  recordVeilCheck: (record: VeilCheckRecord) => void;
  recordPlumbCheck: (record: StampedPlumbCheck) => void;
  recordReceipt: (receipt: SessionReceiptEntry) => void;
  seedDemoMetrics: () => void;
  sessionReceipts: SessionReceiptEntry[];
  connectedRepository: ConnectedRepository | null;
  setConnectedRepository: (repository: ConnectedRepository | null) => void;
  sourceDocuments: SourceDocument[];
  addSourceDocument: (document: SourceDocument) => void;
  removeSourceDocument: (id: string) => void;
  resetDemo: () => void;
}

const Ctx = createContext<DemoStore | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [activeModel, setActiveModelState] = useState("");
  const [gateway, setGateway] = useState<GatewayView>({ phase: "loading" });
  const [checkingModels, setCheckingModels] = useState<string[]>([]);
  const autoVerified = useRef(new Set<string>());
  const [killSwitch, setKillSwitch] = useState(false);
  const [driftMode, setDriftMode] = useState<DriftMode>("clean");
  const [recentRuns, setRecentRuns] = useState<GatewayRun[]>([]);
  const [activePolicyIds, setActivePolicyIds] = useState<string[]>(DEFAULT_ACTIVE_POLICY_IDS);
  const [customPolicies, setCustomPolicies] = useState<PolicyDefinition[]>([]);
  const [localMetrics, setLocalMetrics] = useState<LocalMetricsLedger>(seededLedger);
  const [sessionReceipts, setSessionReceipts] = useState<SessionReceiptEntry[]>([]);
  const [connectedRepository, setConnectedRepository] = useState<ConnectedRepository | null>(null);
  const [sourceDocuments, setSourceDocuments] = useState<SourceDocument[]>([]);

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
          const normalized = normalizeLedger(parsed);
          setLocalMetrics({ ...normalized, days: pruneDays(normalized.days) });
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

  useEffect(() => {
    try {
      for (const key of LEGACY_SOURCE_STORAGE_KEYS) window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing was saved there to remove.
    }
  }, []);

  const addSourceDocument = useCallback((document: SourceDocument) => {
    setSourceDocuments((prev) => [...prev.filter((item) => item.id !== document.id), document]);
  }, []);

  const removeSourceDocument = useCallback((id: string) => {
    setSourceDocuments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushRun = useCallback((r: GatewayRun) => {
    setRecentRuns((prev) => [r, ...prev].slice(0, 20));
  }, []);

  const markGatewayLocked = useCallback((expired: boolean) => {
    setGateway({ phase: "locked", expired });
  }, []);

  const applyGatewayError = useCallback((error: unknown) => {
    if (needsUnlock(error)) {
      setGateway({
        phase: "locked",
        expired: (error as GatewayHttpError).code === "session-expired",
      });
    } else if (error instanceof GatewayHttpError && error.status === 404) {
      setGateway({ phase: "unavailable", reason: "disabled" });
    } else if (error instanceof GatewayHttpError && error.code === "gateway-token-missing") {
      setGateway({ phase: "unavailable", reason: "token-missing" });
    } else {
      setGateway({
        phase: "unavailable",
        reason: "error",
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }, []);

  const refreshGateway = useCallback(async () => {
    try {
      const status = await gatewayClient.status();
      setGateway({ phase: "ready", status });
      setActiveModelState((current) =>
        status.models.includes(current) ? current : (status.defaultModelId ?? ""),
      );
    } catch (error) {
      applyGatewayError(error);
    }
  }, [applyGatewayError]);

  useEffect(() => {
    void refreshGateway();
  }, [refreshGateway]);

  const unlockGateway = useCallback(
    async (token: string) => {
      try {
        await gatewayClient.unlock(token);
      } catch (error) {
        if (error instanceof GatewayHttpError && error.code === "token-rejected") {
          return "That gateway token was not accepted.";
        }
        if (error instanceof GatewayHttpError && error.code === "rate-limited") {
          return "Too many attempts. Wait a minute and try again.";
        }
        return "The gateway could not be unlocked.";
      }
      await refreshGateway();
      return null;
    },
    [refreshGateway],
  );

  const verifyGatewayModel = useCallback(
    async (modelId: string) => {
      setCheckingModels((current) => [...new Set([...current, modelId])]);
      try {
        const result = await gatewayClient.verify(modelId);
        setGateway((current) =>
          current.phase === "ready"
            ? {
                phase: "ready",
                status: {
                  ...current.status,
                  connections: { ...current.status.connections, [modelId]: result.connection },
                },
              }
            : current,
        );
      } catch (error) {
        applyGatewayError(error);
      } finally {
        setCheckingModels((current) => current.filter((id) => id !== modelId));
      }
    },
    [applyGatewayError],
  );

  // Choosing a model shows that model's own state and checks it once, automatically.
  const setActiveModel = useCallback(
    (modelId: string) => {
      setActiveModelState(modelId);
      if (gateway.phase !== "ready" || !gateway.status.configured) return;
      const connection = gateway.status.connections[modelId];
      if (connection?.state !== "not_connected" || autoVerified.current.has(modelId)) return;
      autoVerified.current.add(modelId);
      void verifyGatewayModel(modelId);
    },
    [gateway, verifyGatewayModel],
  );

  const setPolicyActive = useCallback((policyId: string, active: boolean) => {
    setActivePolicyIds((current) =>
      active ? [...new Set([...current, policyId])] : current.filter((id) => id !== policyId),
    );
  }, []);

  const addCustomPolicy = useCallback((policy: PolicyDefinition) => {
    setCustomPolicies((current) => [...current, policy]);
    setActivePolicyIds((current) => [...new Set([...current, policy.id])]);
  }, []);

  // An edit keeps the policy id, so activation and past receipts (which record id@version at
  // check time) are unaffected; only later checks see the new definition.
  const updateCustomPolicy = useCallback((policy: PolicyDefinition) => {
    setCustomPolicies((current) =>
      current.map((existing) => (existing.id === policy.id ? policy : existing)),
    );
  }, []);

  const removeCustomPolicy = useCallback((policyId: string) => {
    setCustomPolicies((current) => current.filter((policy) => policy.id !== policyId));
    setActivePolicyIds((current) => current.filter((id) => id !== policyId));
  }, []);

  const mutateToday = useCallback((mutate: (day: LedgerDay) => void) => {
    setLocalMetrics((current) => mutateLedgerDay(current, utcDayKey(), mutate));
  }, []);

  const recordVeilCheck = useCallback((record: VeilCheckRecord) => {
    // Stamped once, outside the state updater, so a replayed updater cannot re-stamp it.
    const stamp = stampCheck();
    setLocalMetrics((current) => {
      const next = mutateLedgerDay(current, checkDayKey(stamp), (day) => {
        day.veil.checks += 1;
        day.veil[record.verdict] += 1;
        day.veil.occurrences += record.occurrences;
        day.veil.redacted += record.redacted;
        day.veil.tokenized += record.tokenized;
        day.veil.chars += record.chars;
      });
      if (!record.exposureBand || typeof record.exposureScore !== "number") return next;
      return addPrediction(next, {
        kind: "residual-exposure",
        score: record.exposureScore,
        band: record.exposureBand,
        at: stamp.checkedAt,
        sequence: stamp.sequence,
      });
    });
  }, []);

  // Dated by when the comparison completed, not by when its prediction arrived.
  const recordPlumbCheck = useCallback((record: StampedPlumbCheck) => {
    setLocalMetrics((current) => recordPlumbCheckInLedger(current, record));
  }, []);

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
    setConnectedRepository(null);
    setSourceDocuments([]);
  }, []);

  const value = useMemo(
    () => ({
      activeModel,
      setActiveModel,
      gateway,
      checkingModels,
      refreshGateway,
      unlockGateway,
      verifyGatewayModel,
      markGatewayLocked,
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
      updateCustomPolicy,
      removeCustomPolicy,
      localMetrics,
      recordVeilCheck,
      recordPlumbCheck,
      recordReceipt,
      seedDemoMetrics,
      sessionReceipts,
      connectedRepository,
      setConnectedRepository,
      sourceDocuments,
      addSourceDocument,
      removeSourceDocument,
      resetDemo,
    }),
    [
      activeModel,
      setActiveModel,
      gateway,
      checkingModels,
      refreshGateway,
      unlockGateway,
      verifyGatewayModel,
      markGatewayLocked,
      killSwitch,
      driftMode,
      recentRuns,
      pushRun,
      activePolicyIds,
      setPolicyActive,
      customPolicies,
      addCustomPolicy,
      updateCustomPolicy,
      removeCustomPolicy,
      localMetrics,
      recordVeilCheck,
      recordPlumbCheck,
      recordReceipt,
      seedDemoMetrics,
      sessionReceipts,
      connectedRepository,
      sourceDocuments,
      addSourceDocument,
      removeSourceDocument,
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
