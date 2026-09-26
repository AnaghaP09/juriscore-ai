import {
  driftRiskPredictionSchema,
  exposurePredictionSchema,
  type DriftRiskPrediction,
  type ExposurePrediction,
} from "../core/contracts";
import { sha256Hex } from "../core/receipts";
import type { DiffFile } from "../plumb/sources";
import type { VeilProfile } from "../veil/engine";
import { EXPOSURE_FEATURES_VERSION } from "./exposure-features";
import { EXPOSURE_WEIGHTS, loadExposureWeights, type ExposureWeights } from "./exposure-model";
import { FEATURES_VERSION, type PredictionSourceKind } from "./features";
import { LOCAL_WEIGHTS, loadLocalWeights, type LocalWeights } from "./model";

/**
 * The exportable record of a prediction.
 *
 * The existing receipt digest covers only extracted claims, so two unrelated changes
 * that yield no claims would share one. A prediction therefore gets its own envelope,
 * bound to a digest of everything that produced it. The envelope holds digests,
 * versions, numbers, and (for residual exposure) span offsets and categories only: no
 * document text, code text, sanitized text, rationale, or excerpt.
 *
 * Version 2 carries a `kind`, either drift risk or residual exposure, and the digest
 * covers that kind, so two kinds of prediction can never share a digest. Version 1
 * envelopes (drift risk only, digest without a kind) are still read and verified.
 */

export const ENVELOPE_VERSION = 2;
export const LEGACY_ENVELOPE_VERSION = 1;

export type PredictionKind = "drift-risk" | "residual-exposure";

export interface PredictionModelRef {
  provider: string;
  modelId: string;
  params: Record<string, string | number | boolean>;
}

export interface PredictionDocumentRef {
  id: string;
  contentDigest: string;
}

export interface PredictionRequestRecord {
  sourceKind: PredictionSourceKind;
  diffDigest: string;
  documents: PredictionDocumentRef[];
  policyConfigDigest: string;
  featuresVersion: string;
  weightsDigest: string;
  model: PredictionModelRef | null;
}

export interface PredictionUnavailableRecord {
  status: "unavailable";
  reason: string;
}

/**
 * What a residual-exposure estimate was computed from. The sanitized text is recorded
 * only as a digest.
 */
export interface ExposureRequestRecord {
  sanitizedTextDigest: string;
  profile: VeilProfile;
  policyConfigDigest: string;
  featuresVersion: string;
  weightsDigest: string;
  model: PredictionModelRef | null;
}

export type AnyPredictionRequestRecord = PredictionRequestRecord | ExposureRequestRecord;

export interface DriftRiskEnvelope {
  envelopeVersion: typeof ENVELOPE_VERSION;
  kind: "drift-risk";
  requestDigest: string;
  request: PredictionRequestRecord;
  prediction: DriftRiskPrediction | PredictionUnavailableRecord;
}

export interface ResidualExposureEnvelope {
  envelopeVersion: typeof ENVELOPE_VERSION;
  kind: "residual-exposure";
  requestDigest: string;
  request: ExposureRequestRecord;
  prediction: ExposurePrediction | PredictionUnavailableRecord;
}

export type PredictionEnvelope = DriftRiskEnvelope | ResidualExposureEnvelope;

/** A Phase A drift-risk envelope: no kind, and a digest over the request alone. */
export interface LegacyDriftRiskEnvelope {
  envelopeVersion: typeof LEGACY_ENVELOPE_VERSION;
  requestDigest: string;
  request: PredictionRequestRecord;
  prediction: DriftRiskPrediction | PredictionUnavailableRecord;
}

export type AnyPredictionEnvelope = PredictionEnvelope | LegacyDriftRiskEnvelope;

export class EnvelopeError extends Error {}

function compareStrings(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

/**
 * JSON with keys sorted at every depth and no whitespace. Values JSON cannot represent
 * exactly are refused rather than silently changed, since a digest over a lossy form
 * would bind two different requests to one hash.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new EnvelopeError("Non-finite numbers are not canonical.");
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const record = value as Record<string, unknown>;
      const members: string[] = [];
      for (const key of Object.keys(record).sort(compareStrings)) {
        if (record[key] === undefined) continue;
        members.push(`${JSON.stringify(key)}:${canonicalJson(record[key])}`);
      }
      return `{${members.join(",")}}`;
    }
    default:
      throw new EnvelopeError(`A ${typeof value} value is not canonical JSON.`);
  }
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

interface CanonicalFile {
  path: string;
  canonical: string;
}

function canonicalFile(file: DiffFile): CanonicalFile {
  // A parsed diff is hashed by its patch as written, so a "\ No newline at end of file"
  // marker, a pure rename, or a mode change all move the digest. A pasted snapshot has
  // no patch and is hashed by its lines.
  const lines = file.lines.map((line) => [line.kind, line.n, line.text]);
  const record = {
    path: file.path,
    change: file.change ?? null,
    snapshot: file.snapshot === true,
    patch: file.patch ?? null,
    lines: file.patch === undefined ? lines : null,
  };
  return { path: file.path, canonical: canonicalJson(record) };
}

function byPathThenContent(a: CanonicalFile, b: CanonicalFile) {
  return compareStrings(a.path, b.path) || compareStrings(a.canonical, b.canonical);
}

/**
 * Digest of the whole change: every file, sorted by its canonical path, with its change
 * kind and full patch text. Reordering files leaves it unchanged; changing any byte of
 * any file's patch does not. Pass the files from
 * `parseUnifiedDiff(text, { includeMetadataOnly: true })` so metadata-only files count.
 */
export async function diffDigest(files: DiffFile[]) {
  const canonical = files.map(canonicalFile).sort(byPathThenContent);
  return sha256Hex(`[${canonical.map((file) => file.canonical).join(",")}]`);
}

export async function weightsDigest(weights: LocalWeights = LOCAL_WEIGHTS) {
  return sha256Hex(canonicalJson(loadLocalWeights(weights)));
}

function byDocument(a: PredictionDocumentRef, b: PredictionDocumentRef) {
  return compareStrings(a.id, b.id) || compareStrings(a.contentDigest, b.contentDigest);
}

export interface PredictionRequestInput {
  sourceKind: PredictionSourceKind;
  files: DiffFile[];
  documents: { id: string; content: string }[];
  /** The active policy configuration. Only its digest is recorded. */
  policyConfig: unknown;
  model?: PredictionModelRef | null;
  weights?: LocalWeights;
}

export async function buildPredictionRequest(
  input: PredictionRequestInput,
): Promise<PredictionRequestRecord> {
  const documents: PredictionDocumentRef[] = [];
  for (const document of input.documents) {
    documents.push({ id: document.id, contentDigest: await sha256Hex(document.content) });
  }
  documents.sort(byDocument);

  return {
    sourceKind: input.sourceKind,
    diffDigest: await diffDigest(input.files),
    documents,
    policyConfigDigest: await sha256Hex(canonicalJson(input.policyConfig ?? null)),
    featuresVersion: FEATURES_VERSION,
    weightsDigest: await weightsDigest(input.weights),
    model: input.model ? pickModelRef(input.model) : null,
  };
}

export async function exposureWeightsDigest(weights: ExposureWeights = EXPOSURE_WEIGHTS) {
  return sha256Hex(canonicalJson(loadExposureWeights(weights)));
}

export interface ExposureRequestInput {
  /** Veil's sanitized output. Only its digest is recorded. */
  sanitizedText: string;
  profile: VeilProfile;
  /** The active policy configuration. Only its digest is recorded. */
  policyConfig: unknown;
  model?: PredictionModelRef | null;
  weights?: ExposureWeights;
}

export async function buildExposureRequest(
  input: ExposureRequestInput,
): Promise<ExposureRequestRecord> {
  return {
    sanitizedTextDigest: await sha256Hex(input.sanitizedText),
    profile: input.profile,
    policyConfigDigest: await sha256Hex(canonicalJson(input.policyConfig ?? null)),
    featuresVersion: EXPOSURE_FEATURES_VERSION,
    weightsDigest: await exposureWeightsDigest(input.weights),
    model: input.model ? pickModelRef(input.model) : null,
  };
}

function inferKind(request: AnyPredictionRequestRecord): PredictionKind {
  return "sanitizedTextDigest" in request ? "residual-exposure" : "drift-risk";
}

/**
 * The digest a version 2 envelope carries: canonical JSON of the kind together with the
 * allowlisted request, so a drift and an exposure request can never collide. Pass the
 * kind whenever it is known; it is inferred from the request's shape only as a fallback.
 */
export async function requestDigest(
  request: AnyPredictionRequestRecord,
  kind: PredictionKind = inferKind(request),
) {
  const picked =
    kind === "drift-risk"
      ? pickRequest(request as PredictionRequestRecord)
      : pickExposureRequest(request as ExposureRequestRecord);
  return sha256Hex(canonicalJson({ kind, request: picked }));
}

/** The digest a version 1 (Phase A) drift envelope carries: the request alone. */
export async function legacyRequestDigest(request: PredictionRequestRecord) {
  return sha256Hex(canonicalJson(pickRequest(request)));
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

function pickModelRef(model: PredictionModelRef): PredictionModelRef {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(model.params)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      params[key] = value;
    }
  }
  return { provider: model.provider, modelId: model.modelId, params };
}

function pickRequest(request: PredictionRequestRecord): PredictionRequestRecord {
  return {
    sourceKind: request.sourceKind,
    diffDigest: request.diffDigest,
    documents: request.documents.map((document) => ({
      id: document.id,
      contentDigest: document.contentDigest,
    })),
    policyConfigDigest: request.policyConfigDigest,
    featuresVersion: request.featuresVersion,
    weightsDigest: request.weightsDigest,
    model: request.model ? pickModelRef(request.model) : null,
  };
}

function pickExposureRequest(request: ExposureRequestRecord): ExposureRequestRecord {
  return {
    sanitizedTextDigest: request.sanitizedTextDigest,
    profile: request.profile,
    policyConfigDigest: request.policyConfigDigest,
    featuresVersion: request.featuresVersion,
    weightsDigest: request.weightsDigest,
    model: request.model ? pickModelRef(request.model) : null,
  };
}

function isUnavailable(prediction: object): prediction is PredictionUnavailableRecord {
  return "status" in prediction && prediction.status === "unavailable";
}

function pickExposurePrediction(
  prediction: ExposurePrediction | PredictionUnavailableRecord,
): ExposurePrediction | PredictionUnavailableRecord {
  if (isUnavailable(prediction)) return { status: "unavailable", reason: prediction.reason };
  // Spans keep offsets, a category, and a score. Whatever text a span covered is not
  // part of the contract and cannot ride along.
  const parsed = exposurePredictionSchema.parse(prediction);
  return {
    tier: parsed.tier,
    engine: parsed.engine,
    modelId: parsed.modelId,
    modelVersion: parsed.modelVersion,
    placeholder: parsed.placeholder,
    maturity: parsed.maturity,
    featuresVersion: parsed.featuresVersion,
    score: parsed.score,
    band: parsed.band,
    spans: parsed.spans.map((span) => ({
      start: span.start,
      end: span.end,
      category: span.category,
      score: span.score,
    })),
    contributions: parsed.contributions.map((contribution) => ({
      feature: contribution.feature,
      weight: contribution.weight,
    })),
  };
}

function pickPrediction(
  prediction: DriftRiskPrediction | PredictionUnavailableRecord,
): DriftRiskPrediction | PredictionUnavailableRecord {
  if (isUnavailable(prediction)) return { status: "unavailable", reason: prediction.reason };
  // Parsing strips every key the contract does not declare; the fields are then copied
  // by name so nothing else can ride along.
  const parsed = driftRiskPredictionSchema.parse(prediction);
  return {
    tier: parsed.tier,
    engine: parsed.engine,
    modelId: parsed.modelId,
    modelVersion: parsed.modelVersion,
    featuresVersion: parsed.featuresVersion,
    score: parsed.score,
    band: parsed.band,
    contributions: parsed.contributions.map((contribution) => ({
      feature: contribution.feature,
      value: contribution.value,
      weight: contribution.weight,
      contribution: contribution.contribution,
    })),
    maturity: parsed.maturity,
    deterministic: parsed.deterministic,
  };
}

/**
 * Rebuilds an envelope from its allowed fields only. Anything else attached along the
 * way (a rationale, an excerpt, a candidate claim, span text) is dropped here, which is
 * why every export path goes through this function. The allowlist is chosen by version
 * and kind; an envelope of any other version or kind is refused.
 */
export function pickEnvelope(envelope: DriftRiskEnvelope): DriftRiskEnvelope;
export function pickEnvelope(envelope: ResidualExposureEnvelope): ResidualExposureEnvelope;
export function pickEnvelope(envelope: LegacyDriftRiskEnvelope): LegacyDriftRiskEnvelope;
export function pickEnvelope(envelope: AnyPredictionEnvelope): AnyPredictionEnvelope;
export function pickEnvelope(envelope: AnyPredictionEnvelope): AnyPredictionEnvelope {
  if (envelope.envelopeVersion === LEGACY_ENVELOPE_VERSION) {
    return {
      envelopeVersion: LEGACY_ENVELOPE_VERSION,
      requestDigest: envelope.requestDigest,
      request: pickRequest(envelope.request),
      prediction: pickPrediction(envelope.prediction),
    };
  }
  if (envelope.envelopeVersion !== ENVELOPE_VERSION) {
    throw new EnvelopeError("Unknown envelope version.");
  }
  switch (envelope.kind) {
    case "drift-risk":
      return {
        envelopeVersion: ENVELOPE_VERSION,
        kind: "drift-risk",
        requestDigest: envelope.requestDigest,
        request: pickRequest(envelope.request),
        prediction: pickPrediction(envelope.prediction),
      };
    case "residual-exposure":
      return {
        envelopeVersion: ENVELOPE_VERSION,
        kind: "residual-exposure",
        requestDigest: envelope.requestDigest,
        request: pickExposureRequest(envelope.request),
        prediction: pickExposurePrediction(envelope.prediction),
      };
    default:
      throw new EnvelopeError("Unknown prediction kind.");
  }
}

export async function buildPredictionEnvelope(
  request: PredictionRequestRecord,
  prediction: DriftRiskPrediction | PredictionUnavailableRecord,
): Promise<DriftRiskEnvelope> {
  return pickEnvelope({
    envelopeVersion: ENVELOPE_VERSION,
    kind: "drift-risk",
    requestDigest: await requestDigest(request, "drift-risk"),
    request,
    prediction,
  });
}

export async function buildExposureEnvelope(
  request: ExposureRequestRecord,
  prediction: ExposurePrediction | PredictionUnavailableRecord,
): Promise<ResidualExposureEnvelope> {
  return pickEnvelope({
    envelopeVersion: ENVELOPE_VERSION,
    kind: "residual-exposure",
    requestDigest: await requestDigest(request, "residual-exposure"),
    request,
    prediction,
  });
}

/**
 * Reads an envelope from outside (a file, storage) through the allowlist: a version 2
 * envelope of either kind, or a version 1 drift envelope. Anything else is refused.
 */
export function readPredictionEnvelope(raw: unknown): AnyPredictionEnvelope {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new EnvelopeError("An envelope must be an object.");
  }
  const candidate = raw as Partial<AnyPredictionEnvelope>;
  if (typeof candidate.requestDigest !== "string" || typeof candidate.request !== "object") {
    throw new EnvelopeError("An envelope needs a request and its digest.");
  }
  if (typeof candidate.prediction !== "object" || candidate.prediction === null) {
    throw new EnvelopeError("An envelope needs a prediction.");
  }
  try {
    return pickEnvelope(candidate as AnyPredictionEnvelope);
  } catch (error) {
    if (error instanceof EnvelopeError) throw error;
    throw new EnvelopeError("The envelope's prediction does not match its contract.");
  }
}

/** The only serialization for receipts, downloads, logs, and persisted state. */
export function serializePredictionEnvelope(envelope: AnyPredictionEnvelope) {
  return canonicalJson(pickEnvelope(envelope));
}

/** True when the envelope's digest still matches the request it carries. */
export async function verifyEnvelopeDigest(envelope: AnyPredictionEnvelope) {
  if (envelope.envelopeVersion === LEGACY_ENVELOPE_VERSION) {
    return envelope.requestDigest === (await legacyRequestDigest(envelope.request));
  }
  if (envelope.kind !== "drift-risk" && envelope.kind !== "residual-exposure") return false;
  return envelope.requestDigest === (await requestDigest(envelope.request, envelope.kind));
}

// ---------------------------------------------------------------------------
// Stale results
// ---------------------------------------------------------------------------

export interface ActivePredictionRequest {
  /** Bumped on every change to the inputs, on reset, and on unmount. */
  generation: number;
  requestDigest: string;
}

export interface PendingPredictionResult {
  generation: number;
  envelope: AnyPredictionEnvelope;
}

/**
 * A result is shown only if it answers the request that is active now. Integrity comes
 * first: the envelope's digest must still match the request it carries. That check is
 * asynchronous, and the inputs can change while it runs, so freshness is decided only
 * afterwards, synchronously, against the latest active request read through
 * `getActive`: same generation and same digest. Anything else is discarded, never
 * displayed.
 */
export async function isCurrentPredictionResult(
  getActive: () => ActivePredictionRequest | null,
  result: PendingPredictionResult,
) {
  if (!(await verifyEnvelopeDigest(result.envelope))) return false;

  const active = getActive();
  if (!active) return false;
  if (result.generation !== active.generation) return false;
  return result.envelope.requestDigest === active.requestDigest;
}
