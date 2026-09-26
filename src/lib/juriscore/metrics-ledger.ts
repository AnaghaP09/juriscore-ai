import type { DriftRiskBand, ValidatorVerdict } from "@/lib/juriscore/core/contracts";
import { isResidualRuleId } from "@/lib/juriscore/predict/exposure-rule";

/**
 * The local metrics ledger's shape and the pure rules for updating it. The ledger holds
 * counts, bands, and scores only: never diff or document text.
 */

export interface PlumbCheckRecord {
  verdict: ValidatorVerdict;
  assertions: number;
  matches: number;
  drifted: number;
  cannotDetermine: number;
  /** Advisory drift-risk band of the change, or null when it had none (sample, snapshot). */
  riskBand?: DriftRiskBand | null;
  /** Advisory drift-risk score from 0 to 100, recorded alongside `riskBand`. */
  riskScore?: number | null;
}

/**
 * When a comparison completed, captured at the moment its verdict was decided rather than
 * when its asynchronous prediction finished, so slow scoring never moves a check to a
 * later day or lets an older check look newer than one run after it.
 */
export interface CheckStamp {
  /** ISO time the comparison completed. Its UTC date is the day the check counts toward. */
  checkedAt: string;
  /** Increases with every check in this session; orders checks with the same time. */
  sequence: number;
}

/** A comparison's counts with the time it completed. */
export type StampedPlumbCheck = PlumbCheckRecord & CheckStamp;

/** Checks by advisory drift-risk band. */
export type RiskBandCounts = Record<DriftRiskBand, number>;

export interface LatestRisk {
  /** 0 to 100. */
  score: number;
  band: DriftRiskBand;
  /** When the check that produced this score completed. */
  at: string;
  /** That check's session sequence, used only to order checks with the same time. */
  sequence: number;
}

export interface LedgerDay {
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
    risk: RiskBandCounts;
  };
  receipts: number;
}

/** Which advisory predictor produced a score. */
export type PredictionKind = "drift-risk" | "residual-exposure";

/** One advisory prediction from a completed check: a score and band only, never text. */
export interface PredictionRecord {
  kind: PredictionKind;
  /** 0 to 100. */
  score: number;
  band: DriftRiskBand;
  at: string;
  sequence: number;
  /**
   * Residual-exposure records only: whether the heuristic residual rule fired on the same
   * sanitized text, and which rules (ids only, never the matched text). Older records and
   * drift-risk records carry neither.
   */
  ruleFlag?: boolean;
  ruleIds?: string[];
}

/** How many recent predictions of each kind the device keeps for the Overview. */
export const RECENT_PREDICTIONS_PER_KIND = 20;

export interface LocalMetricsLedger {
  version: 1;
  simulated: boolean;
  days: Record<string, LedgerDay>;
  /** The most recent advisory drift-risk score on this device, if any. */
  latestRisk: LatestRisk | null;
  /** The latest predictions per kind, newest first. Older saves load with none. */
  recentPredictions: PredictionRecord[];
}

export const RISK_BANDS: readonly DriftRiskBand[] = ["low", "uncertain", "high"];

export const emptyDay = (): LedgerDay => ({
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
    risk: { low: 0, uncertain: 0, high: 0 },
  },
  receipts: 0,
});

const isRiskBand = (value: unknown): value is DriftRiskBand =>
  RISK_BANDS.includes(value as DriftRiskBand);

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

/**
 * Fills in fields that ledgers saved by earlier builds lack. A saved day without drift-risk
 * counts loads with zeros, and a ledger without a latest score loads with none.
 */
export function normalizeLedger(saved: LocalMetricsLedger): LocalMetricsLedger {
  const days: Record<string, LedgerDay> = {};
  for (const [key, day] of Object.entries(saved.days ?? {})) {
    const empty = emptyDay();
    const risk = (day?.plumb as Partial<LedgerDay["plumb"]> | undefined)?.risk;
    days[key] = {
      veil: { ...empty.veil, ...day?.veil },
      plumb: {
        ...empty.plumb,
        ...day?.plumb,
        risk: {
          low: count(risk?.low),
          uncertain: count(risk?.uncertain),
          high: count(risk?.high),
        },
      },
      receipts: count(day?.receipts),
    };
  }
  const latest = saved.latestRisk;
  const latestRisk =
    latest && isRiskBand(latest.band) && typeof latest.at === "string"
      ? {
          score: count(latest.score),
          band: latest.band,
          at: latest.at,
          sequence: count(latest.sequence),
        }
      : null;
  const recentPredictions = Array.isArray(saved.recentPredictions)
    ? saved.recentPredictions
        .filter(
          (entry): entry is PredictionRecord =>
            (entry?.kind === "drift-risk" || entry?.kind === "residual-exposure") &&
            isRiskBand(entry.band) &&
            typeof entry.at === "string",
        )
        .map((entry) => {
          const { ruleFlag, ruleIds, ...rest } = entry;
          // Only a boolean flag and known rule ids survive a reload; anything else is dropped.
          return typeof ruleFlag === "boolean"
            ? {
                ...rest,
                ruleFlag,
                ruleIds: Array.isArray(ruleIds) ? ruleIds.filter(isResidualRuleId) : [],
              }
            : rest;
        })
    : [];
  return {
    version: 1,
    simulated: saved.simulated === true,
    days,
    latestRisk,
    recentPredictions: orderPredictions(recentPredictions),
  };
}

function isNewerPrediction(a: PredictionRecord, b: PredictionRecord) {
  return a.at === b.at ? a.sequence > b.sequence : a.at > b.at;
}

/** Newest first, capped per kind, so a busy predictor never crowds out the other. */
export function orderPredictions(entries: PredictionRecord[]): PredictionRecord[] {
  const sorted = [...entries].sort((a, b) => (isNewerPrediction(a, b) ? -1 : 1));
  const kept: Record<PredictionKind, number> = { "drift-risk": 0, "residual-exposure": 0 };
  return sorted.filter((entry) => {
    kept[entry.kind] += 1;
    return kept[entry.kind] <= RECENT_PREDICTIONS_PER_KIND;
  });
}

/** Adds a prediction to the device history; ledgers still showing the seed start empty. */
export function addPrediction(
  ledger: LocalMetricsLedger,
  prediction: PredictionRecord,
): LocalMetricsLedger {
  const previous = ledger.simulated ? [] : ledger.recentPredictions;
  return { ...ledger, recentPredictions: orderPredictions([prediction, ...previous]) };
}

/** Adds one Plumb check to a day. Only counts and the band are kept. */
export function addPlumbCheck(day: LedgerDay, record: PlumbCheckRecord) {
  day.plumb.checks += 1;
  day.plumb[record.verdict] += 1;
  day.plumb.assertions += record.assertions;
  day.plumb.matches += record.matches;
  day.plumb.drifted += record.drifted;
  day.plumb.cannotDetermine += record.cannotDetermine;
  if (isRiskBand(record.riskBand)) day.plumb.risk[record.riskBand] += 1;
}

let lastCheckSequence = 0;

/** Stamps a comparison as it completes. Call it before any asynchronous work starts. */
export function stampCheck(now: Date = new Date()): CheckStamp {
  lastCheckSequence += 1;
  return { checkedAt: now.toISOString(), sequence: lastCheckSequence };
}

/** The UTC day a check counts toward: the date it completed, not the date it was recorded. */
export function checkDayKey(stamp: CheckStamp) {
  return new Date(stamp.checkedAt).toISOString().slice(0, 10);
}

/** Whether a check completed after the one that produced the stored latest score. */
export function isNewerCheck(stamp: CheckStamp, latest: LatestRisk) {
  const checked = Date.parse(stamp.checkedAt);
  const stored = Date.parse(latest.at);
  if (Number.isNaN(stored)) return true;
  if (checked !== stored) return checked > stored;
  return stamp.sequence > latest.sequence;
}

/**
 * The latest score after a check. The previous one stays when the check had no score, or
 * when the check completed before the one that produced it: checks can finish scoring in
 * a different order than they were run.
 */
export function latestRiskAfter(
  previous: LatestRisk | null,
  record: StampedPlumbCheck,
): LatestRisk | null {
  if (!isRiskBand(record.riskBand) || typeof record.riskScore !== "number") return previous;
  if (previous && !isNewerCheck(record, previous)) return previous;
  return {
    score: record.riskScore,
    band: record.riskBand,
    at: record.checkedAt,
    sequence: record.sequence,
  };
}

/**
 * Applies a change to one UTC day of the ledger. The first real record evicts the
 * simulated seed entirely.
 */
export function mutateLedgerDay(
  ledger: LocalMetricsLedger,
  key: string,
  mutate: (day: LedgerDay) => void,
  nextLatestRisk?: (previous: LatestRisk | null) => LatestRisk | null,
): LocalMetricsLedger {
  const days = ledger.simulated ? {} : { ...ledger.days };
  const previousRisk = ledger.simulated ? null : ledger.latestRisk;
  const day = structuredClone(days[key] ?? emptyDay());
  mutate(day);
  return {
    version: 1,
    simulated: false,
    days: { ...days, [key]: day },
    latestRisk: nextLatestRisk ? nextLatestRisk(previousRisk) : previousRisk,
    recentPredictions: ledger.simulated ? [] : ledger.recentPredictions,
  };
}

/**
 * Records one Plumb check in the day it completed, and moves the latest score only if
 * this check is newer than the one that produced it.
 */
export function recordPlumbCheckInLedger(
  ledger: LocalMetricsLedger,
  record: StampedPlumbCheck,
): LocalMetricsLedger {
  const next = mutateLedgerDay(
    ledger,
    checkDayKey(record),
    (day) => addPlumbCheck(day, record),
    (previous) => latestRiskAfter(previous, record),
  );
  if (!isRiskBand(record.riskBand) || typeof record.riskScore !== "number") return next;
  return addPrediction(next, {
    kind: "drift-risk",
    score: record.riskScore,
    band: record.riskBand,
    at: record.checkedAt,
    sequence: record.sequence,
  });
}
