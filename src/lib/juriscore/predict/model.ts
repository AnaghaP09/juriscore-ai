import { z } from "zod";
import {
  driftRiskPredictionSchema,
  evaluationMaturitySchema,
  type DriftRiskBand,
  type DriftRiskContribution,
  type DriftRiskPrediction,
} from "../core/contracts";
import {
  extractDriftFeatures,
  FEATURE_NAMES,
  FEATURES_VERSION,
  type FeatureVector,
  type PredictionInput,
  type PredictionUnavailable,
} from "./features";
import bundledWeights from "./weights.json";

/**
 * The free-tier local predictor: L2 logistic regression with fixed coefficients.
 *
 * Inference is a dot product and a sigmoid, so the same change always yields the same
 * score, band, and attribution. The result is advisory. It is never an input to Plumb's
 * comparison, so it cannot allow, revise, or block anything.
 */

export const localWeightsSchema = z.object({
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  placeholder: z.boolean(),
  note: z.string().optional(),
  featuresVersion: z.string().min(1),
  maturity: evaluationMaturitySchema,
  intercept: z.number().finite(),
  coefficients: z.record(z.number().finite()),
  bands: z.object({ uncertain: z.number().min(0).max(1), high: z.number().min(0).max(1) }),
});

export type LocalWeights = z.infer<typeof localWeightsSchema>;

export class WeightsError extends Error {}

// Weight packs that passed validation. Each is frozen, so it cannot change after being
// checked, and scoring can trust membership here instead of re-validating.
const VALIDATED = new WeakSet<object>();

/**
 * Validates a weight pack against the running feature extractor and returns a frozen
 * copy. Weights fitted to a different feature version, or to a different feature set,
 * would score a vector whose positions mean something else, so a mismatch is refused
 * rather than tolerated. Every scoring entry point calls this first.
 */
export function loadLocalWeights(raw: unknown): LocalWeights {
  if (typeof raw === "object" && raw !== null && VALIDATED.has(raw)) return raw as LocalWeights;

  const parsed = localWeightsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new WeightsError(`Weights are malformed: ${parsed.error.issues[0]?.message ?? ""}`);
  }
  const weights = parsed.data;
  if (weights.featuresVersion !== FEATURES_VERSION) {
    throw new WeightsError(
      `Weights were fitted to ${weights.featuresVersion}; this extractor produces ${FEATURES_VERSION}.`,
    );
  }
  const expected = [...FEATURE_NAMES].sort();
  const actual = Object.keys(weights.coefficients).sort();
  if (expected.join("\n") !== actual.join("\n")) {
    throw new WeightsError("Weights must carry exactly one coefficient per feature.");
  }
  if (weights.bands.uncertain > weights.bands.high) {
    throw new WeightsError("Band thresholds must be ordered.");
  }

  const frozen: LocalWeights = Object.freeze({
    ...weights,
    coefficients: Object.freeze({ ...weights.coefficients }),
    bands: Object.freeze({ ...weights.bands }),
  });
  VALIDATED.add(frozen);
  return frozen;
}

export const LOCAL_WEIGHTS: LocalWeights = loadLocalWeights(bundledWeights);

// Scores are rounded so that the serialized prediction is byte-stable across platforms
// that could differ in the last bits of exp().
const SCORE_PRECISION = 1e6;

function round(value: number) {
  return Math.round(value * SCORE_PRECISION) / SCORE_PRECISION;
}

export function bandFor(score: number, candidate: LocalWeights = LOCAL_WEIGHTS): DriftRiskBand {
  const weights = loadLocalWeights(candidate);
  if (score >= weights.bands.high) return "high";
  if (score >= weights.bands.uncertain) return "uncertain";
  return "low";
}

// Largest effect first; ties broken by name so the order never depends on the engine.
function byMagnitude(a: DriftRiskContribution, b: DriftRiskContribution) {
  const difference = Math.abs(b.contribution) - Math.abs(a.contribution);
  if (difference !== 0) return difference;
  if (a.feature === b.feature) return 0;
  return a.feature < b.feature ? -1 : 1;
}

/**
 * Scores a feature vector, with every feature's contribution ranked by magnitude. Weights
 * are validated first, so a pack fitted to another feature version or set is refused.
 */
export function scoreFeatureVector(
  vector: FeatureVector,
  candidate: LocalWeights = LOCAL_WEIGHTS,
): DriftRiskPrediction {
  const weights = loadLocalWeights(candidate);
  let logit = weights.intercept;
  for (const feature of FEATURE_NAMES) logit += weights.coefficients[feature] * vector[feature];
  const score = round(1 / (1 + Math.exp(-logit)));

  const contributions: DriftRiskContribution[] = FEATURE_NAMES.map((feature) => {
    const weight = weights.coefficients[feature];
    const value = vector[feature];
    return { feature, value: round(value), weight, contribution: round(weight * value) };
  });
  contributions.sort(byMagnitude);

  return driftRiskPredictionSchema.parse({
    tier: "free",
    engine: "local-logistic",
    modelId: weights.modelId,
    modelVersion: weights.modelVersion,
    featuresVersion: FEATURES_VERSION,
    score,
    band: bandFor(score, weights),
    contributions,
    maturity: weights.maturity,
    deterministic: true,
  });
}

/**
 * Predicts drift risk for a whole change, or says why it cannot. Weights are validated
 * before anything else, even when the change turns out to have nothing to score.
 */
export function predictDriftRisk(
  input: PredictionInput,
  candidate: LocalWeights = LOCAL_WEIGHTS,
): DriftRiskPrediction | PredictionUnavailable {
  const weights = loadLocalWeights(candidate);
  const extraction = extractDriftFeatures(input);
  if (extraction.status === "unavailable") return extraction;
  return scoreFeatureVector(extraction.vector, weights);
}
