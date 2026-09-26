import { z } from "zod";
import {
  exposurePredictionSchema,
  type DriftRiskBand,
  type ExposureContribution,
  type ExposurePrediction,
} from "../core/contracts";
import {
  EXPOSURE_FEATURE_NAMES,
  EXPOSURE_FEATURES_VERSION,
  extractExposureFeatures,
  type ExposureFeatureVector,
  type ExposureInput,
} from "./exposure-features";
import bundledWeights from "./exposure-weights.json";

/**
 * The free-tier residual-exposure predictor: logistic regression with fixed coefficients
 * over the features of Veil's sanitized output.
 *
 * Inference is a dot product and a sigmoid, so the same text always yields the same
 * score, band, spans, and attribution. The result is advisory. It is never an input to
 * Veil's own outcome; a high band can at most ask the user to confirm before copying.
 */

export const exposureWeightsSchema = z.object({
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  placeholder: z.boolean(),
  note: z.string().optional(),
  featuresVersion: z.string().min(1),
  maturity: z.enum(["target", "synthetic", "benchmark"]),
  intercept: z.number().finite(),
  coefficients: z.record(z.number().finite()),
  bands: z.object({ uncertain: z.number().min(0).max(1), high: z.number().min(0).max(1) }),
});

export type ExposureWeights = z.infer<typeof exposureWeightsSchema>;

export class ExposureWeightsError extends Error {}

// Weight packs that passed validation. Each is frozen, so it cannot change after being
// checked, and scoring can trust membership here instead of re-validating.
const VALIDATED = new WeakSet<object>();

/**
 * Validates a weight pack against the running feature extractor and returns a frozen
 * copy. A pack fitted to another feature version or feature set is refused. Every
 * inference entry point calls this first.
 */
export function loadExposureWeights(raw: unknown): ExposureWeights {
  if (typeof raw === "object" && raw !== null && VALIDATED.has(raw)) {
    return raw as ExposureWeights;
  }

  const parsed = exposureWeightsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ExposureWeightsError(
      `Exposure weights are malformed: ${parsed.error.issues[0]?.message ?? ""}`,
    );
  }
  const weights = parsed.data;
  if (weights.featuresVersion !== EXPOSURE_FEATURES_VERSION) {
    throw new ExposureWeightsError(
      `Weights were fitted to ${weights.featuresVersion}; this extractor produces ${EXPOSURE_FEATURES_VERSION}.`,
    );
  }
  const expected = [...EXPOSURE_FEATURE_NAMES].sort();
  const actual = Object.keys(weights.coefficients).sort();
  if (expected.join("\n") !== actual.join("\n")) {
    throw new ExposureWeightsError("Weights must carry exactly one coefficient per feature.");
  }
  if (weights.bands.uncertain > weights.bands.high) {
    throw new ExposureWeightsError("Band thresholds must be ordered.");
  }

  const frozen: ExposureWeights = Object.freeze({
    ...weights,
    coefficients: Object.freeze({ ...weights.coefficients }),
    bands: Object.freeze({ ...weights.bands }),
  });
  VALIDATED.add(frozen);
  return frozen;
}

export const EXPOSURE_WEIGHTS: ExposureWeights = loadExposureWeights(bundledWeights);

const SCORE_PRECISION = 1e6;

function round(value: number) {
  return Math.round(value * SCORE_PRECISION) / SCORE_PRECISION;
}

export function exposureBandFor(
  score: number,
  candidate: ExposureWeights = EXPOSURE_WEIGHTS,
): DriftRiskBand {
  const weights = loadExposureWeights(candidate);
  if (score >= weights.bands.high) return "high";
  if (score >= weights.bands.uncertain) return "uncertain";
  return "low";
}

// Largest effect first; ties broken by name so the order never depends on the engine.
function byMagnitude(a: ExposureContribution, b: ExposureContribution) {
  const difference = Math.abs(b.weight) - Math.abs(a.weight);
  if (difference !== 0) return difference;
  if (a.feature === b.feature) return 0;
  return a.feature < b.feature ? -1 : 1;
}

/** Scores a feature vector with ranked contributions; spans are supplied by the caller. */
export function scoreExposureVector(
  vector: ExposureFeatureVector,
  spans: ExposurePrediction["spans"],
  candidate: ExposureWeights = EXPOSURE_WEIGHTS,
): ExposurePrediction {
  const weights = loadExposureWeights(candidate);
  let logit = weights.intercept;
  for (const feature of EXPOSURE_FEATURE_NAMES) {
    logit += weights.coefficients[feature] * vector[feature];
  }
  const score = round(1 / (1 + Math.exp(-logit)));

  const contributions: ExposureContribution[] = EXPOSURE_FEATURE_NAMES.map((feature) => ({
    feature,
    weight: round(weights.coefficients[feature] * vector[feature]),
  }));
  contributions.sort(byMagnitude);

  return exposurePredictionSchema.parse({
    tier: "free",
    engine: "local",
    modelId: weights.modelId,
    modelVersion: weights.modelVersion,
    placeholder: weights.placeholder,
    maturity: weights.maturity,
    featuresVersion: EXPOSURE_FEATURES_VERSION,
    score,
    band: exposureBandFor(score, weights),
    spans,
    contributions,
  });
}

/**
 * Predicts residual exposure for Veil's sanitized output. Weights are validated before
 * anything else, so a mismatched pack is refused even for empty text.
 */
export function predictResidualExposure(
  input: ExposureInput,
  candidate: ExposureWeights = EXPOSURE_WEIGHTS,
): ExposurePrediction {
  const weights = loadExposureWeights(candidate);
  const extraction = extractExposureFeatures(input);
  return scoreExposureVector(extraction.vector, extraction.spans, weights);
}
