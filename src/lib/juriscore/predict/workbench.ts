import type { DriftRiskBand, DriftRiskContribution } from "../core/contracts";
import { parseSourceSnapshot, parseUnifiedDiff, type DiffFile } from "../plumb/sources";
import { isDocPath, normalizeDocPath } from "./doc-paths";
import {
  buildPredictionEnvelope,
  buildPredictionRequest,
  isCurrentPredictionResult,
  requestDigest,
  type ActivePredictionRequest,
  type PredictionEnvelope,
  type PredictionRequestInput,
  type PredictionRequestRecord,
} from "./envelope";
import { extractDriftFeatures, type PredictionSourceKind } from "./features";
import { LOCAL_WEIGHTS, scoreFeatureVector } from "./model";

/**
 * What the Plumb workbench shows about drift risk for the connected change.
 *
 * Everything here is advisory. The band is computed next to Plumb's comparison, never
 * fed into it, so the comparison of the same claims comes out the same with or without
 * it.
 */

export interface ConnectedChange {
  /** Set from the parser that accepted the text, never guessed from line kinds. */
  sourceKind: PredictionSourceKind;
  /** Every parsed file of the change, including metadata-only ones. */
  files: DiffFile[];
}

/**
 * Reads connected text the way the workbench does: as a unified diff when it parses as
 * one, otherwise as the current state of a single source file.
 */
export function parseConnectedChange(text: string, sourcePath = "source"): ConnectedChange {
  const files = parseUnifiedDiff(text, { includeMetadataOnly: true });
  if (files.length > 0) return { sourceKind: "diff", files };
  return { sourceKind: "snapshot", files: [parseSourceSnapshot(text, sourcePath)] };
}

/** Documentation files the change already touches, sorted. A plain fact, not an input. */
export function docsTouchedBy(change: ConnectedChange) {
  if (change.sourceKind === "snapshot") return [];
  const paths = change.files.map((file) => normalizeDocPath(file.path)).filter(isDocPath);
  return [...new Set(paths)].sort();
}

export type WorkbenchRisk =
  | {
      status: "scored";
      band: DriftRiskBand;
      /** The score as a whole number from 0 to 100. */
      score: number;
      placeholder: boolean;
      maturity: string;
      contributions: DriftRiskContribution[];
      docsTouched: string[];
    }
  | { status: "unavailable"; reason: "no-baseline" | "no-code-files"; docsTouched: string[] };

export interface WorkbenchRiskResult {
  request: PredictionRequestRecord;
  envelope: PredictionEnvelope;
  risk: WorkbenchRisk;
}

export function riskScorePercent(score: number) {
  return Math.round(score * 100);
}

/** Largest positive contributions first: the features that pushed the score up. */
export function topContributions(contributions: DriftRiskContribution[], limit = 3) {
  return contributions.filter((contribution) => contribution.contribution > 0).slice(0, limit);
}

export async function buildWorkbenchRequest(
  change: ConnectedChange,
  context: Pick<PredictionRequestInput, "documents" | "policyConfig">,
) {
  const request = await buildPredictionRequest({ ...change, ...context });
  return { request, requestDigest: await requestDigest(request) };
}

/** Scores the change locally and wraps the result in an envelope bound to its request. */
export async function assessWorkbenchRisk(
  change: ConnectedChange,
  request: PredictionRequestRecord,
): Promise<WorkbenchRiskResult> {
  const docsTouched = docsTouchedBy(change);
  const extraction = extractDriftFeatures(change);
  if (extraction.status === "unavailable") {
    const unavailable = { status: "unavailable" as const, reason: extraction.reason };
    return {
      request,
      envelope: await buildPredictionEnvelope(request, unavailable),
      risk: { ...unavailable, docsTouched },
    };
  }
  const prediction = scoreFeatureVector(extraction.vector);
  return {
    request,
    envelope: await buildPredictionEnvelope(request, prediction),
    risk: {
      status: "scored",
      band: prediction.band,
      score: riskScorePercent(prediction.score),
      placeholder: LOCAL_WEIGHTS.placeholder,
      maturity: prediction.maturity,
      contributions: prediction.contributions,
      docsTouched,
    },
  };
}

export type WorkbenchRiskScorer = typeof assessWorkbenchRisk;

/** What the risk panel can show: a result, or a note that scoring failed. */
export type WorkbenchRiskView = WorkbenchRisk | { status: "failed" };

/**
 * Everything one scoring request reads. The workbench memoizes this object, so its
 * identity changes exactly when any input changes or a reset asks for a fresh request.
 */
export interface WorkbenchRiskInputs {
  change: ConnectedChange | null;
  documents: PredictionRequestInput["documents"];
  policyConfig: PredictionRequestInput["policyConfig"];
  /** Bumped by a reset so it always starts a fresh request. */
  run: number;
}

/** A result that was accepted, bound to the inputs and generation that produced it. */
export interface AcceptedWorkbenchRisk {
  inputs: WorkbenchRiskInputs;
  generation: number;
  risk: WorkbenchRiskView;
}

export interface WorkbenchRiskRefs {
  generation: { current: number };
  active: { current: ActivePredictionRequest | null };
}

/**
 * The accepted result, but only while it still answers the current inputs and
 * generation. An already-accepted result for a replaced source is never shown beside the
 * new source, even in the render before scoring for the new source starts.
 */
export function visibleWorkbenchRisk(
  accepted: AcceptedWorkbenchRisk | null,
  inputs: WorkbenchRiskInputs,
  generation: number,
): WorkbenchRiskView | null {
  if (!accepted) return null;
  if (accepted.inputs !== inputs || accepted.generation !== generation) return null;
  return accepted.risk;
}

/** Retires whatever request is running: a reset, an input change, or unmount. */
export function retireWorkbenchRisk(refs: WorkbenchRiskRefs) {
  refs.generation.current += 1;
  refs.active.current = null;
}

/**
 * Starts scoring the given inputs and returns the cleanup that retires it. `accept` is
 * called with null straight away, and later with a result only if its generation and
 * request digest are still the active ones.
 */
export function startWorkbenchRiskScoring(
  inputs: WorkbenchRiskInputs,
  refs: WorkbenchRiskRefs,
  accept: (accepted: AcceptedWorkbenchRisk | null) => void,
  scorer: WorkbenchRiskScorer = assessWorkbenchRisk,
): () => void {
  const generation = ++refs.generation.current;
  refs.active.current = null;
  accept(null);
  const change = inputs.change;
  if (change) {
    const isStillActive = () => refs.generation.current === generation;
    void (async () => {
      try {
        const { request, requestDigest: digest } = await buildWorkbenchRequest(change, {
          documents: inputs.documents,
          policyConfig: inputs.policyConfig,
        });
        if (!isStillActive()) return;
        refs.active.current = { generation, requestDigest: digest };
        const result = await scorer(change, request);
        const current = await isCurrentPredictionResult(() => refs.active.current, {
          generation,
          envelope: result.envelope,
        });
        // Committed in the same continuation as the freshness check, so nothing can
        // change the active request in between.
        if (current) accept({ inputs, generation, risk: result.risk });
      } catch {
        if (isStillActive()) accept({ inputs, generation, risk: { status: "failed" } });
      }
    })();
  }
  return () => retireWorkbenchRisk(refs);
}

/** The advisory band and score a recorded check carries. */
export interface CheckRisk {
  riskBand: DriftRiskBand | null;
  riskScore: number | null;
}

/**
 * The prediction for a comparison's exact inputs, scored from those inputs rather than
 * read from whatever the panel happens to show, so a check run while the panel is still
 * scoring records the same band the panel then shows. Never rejects: no change, no
 * score, or a failure all record as no band.
 */
export async function riskForCheck(
  change: ConnectedChange | null,
  context: Pick<PredictionRequestInput, "documents" | "policyConfig">,
  scorer: WorkbenchRiskScorer = assessWorkbenchRisk,
): Promise<CheckRisk> {
  if (!change) return { riskBand: null, riskScore: null };
  try {
    const { request } = await buildWorkbenchRequest(change, context);
    const { risk } = await scorer(change, request);
    if (risk.status !== "scored") return { riskBand: null, riskScore: null };
    return { riskBand: risk.band, riskScore: risk.score };
  } catch {
    return { riskBand: null, riskScore: null };
  }
}

/**
 * Records one comparison exactly once, with the prediction for its exact inputs attached.
 * The comparison outcome is already decided before this runs; the prediction never feeds it.
 */
export async function recordCheckWithRisk<R extends object>(
  record: R,
  change: ConnectedChange | null,
  context: Pick<PredictionRequestInput, "documents" | "policyConfig">,
  onRecord: (record: R & CheckRisk) => void,
  scorer: WorkbenchRiskScorer = assessWorkbenchRisk,
) {
  const risk = await riskForCheck(change, context, scorer);
  onRecord({ ...record, ...risk });
}
