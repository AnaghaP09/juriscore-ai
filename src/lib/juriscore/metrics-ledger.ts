import type { DriftRiskBand, ValidatorVerdict } from "@/lib/juriscore/core/contracts";

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

/** Checks by advisory drift-risk band. */
export type RiskBandCounts = Record<DriftRiskBand, number>;

export interface LatestRisk {
  /** 0 to 100. */
  score: number;
  band: DriftRiskBand;
  at: string;
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

export interface LocalMetricsLedger {
  version: 1;
  simulated: boolean;
  days: Record<string, LedgerDay>;
  /** The most recent advisory drift-risk score on this device, if any. */
  latestRisk: LatestRisk | null;
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
      ? { score: count(latest.score), band: latest.band, at: latest.at }
      : null;
  return { version: 1, simulated: saved.simulated === true, days, latestRisk };
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

/** The latest score after a check, or the previous one when the check had no score. */
export function latestRiskAfter(
  previous: LatestRisk | null,
  record: PlumbCheckRecord,
  at: string,
): LatestRisk | null {
  if (!isRiskBand(record.riskBand) || typeof record.riskScore !== "number") return previous;
  return { score: record.riskScore, band: record.riskBand, at };
}
