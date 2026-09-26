import type { DriftRiskBand, DriftRiskContribution } from "../core/contracts";
import { parseSourceSnapshot, parseUnifiedDiff, type DiffFile } from "../plumb/sources";
import { isDocPath, normalizeDocPath } from "./doc-paths";
import {
  buildPredictionEnvelope,
  buildPredictionRequest,
  requestDigest,
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
