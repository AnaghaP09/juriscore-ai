import { driftRiskPredictionSchema, type DriftRiskPrediction } from "../core/contracts";
import { sha256Hex } from "../core/receipts";
import type { DiffFile } from "../plumb/sources";
import { FEATURES_VERSION, type PredictionSourceKind } from "./features";
import { LOCAL_WEIGHTS, loadLocalWeights, type LocalWeights } from "./model";

/**
 * The exportable record of a prediction.
 *
 * The existing receipt digest covers only extracted claims, so two unrelated changes
 * that yield no claims would share one. A prediction therefore gets its own envelope,
 * bound to a digest of everything that produced it. The envelope holds digests,
 * versions, and numbers only: no document text, code text, rationale, or excerpt.
 */

export const ENVELOPE_VERSION = 1;

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

export interface PredictionEnvelope {
  envelopeVersion: typeof ENVELOPE_VERSION;
  requestDigest: string;
  request: PredictionRequestRecord;
  prediction: DriftRiskPrediction | PredictionUnavailableRecord;
}

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

export async function requestDigest(request: PredictionRequestRecord) {
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

function pickPrediction(
  prediction: DriftRiskPrediction | PredictionUnavailableRecord,
): DriftRiskPrediction | PredictionUnavailableRecord {
  if ("status" in prediction && prediction.status === "unavailable") {
    return { status: "unavailable", reason: prediction.reason };
  }
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
 * way (a rationale, an excerpt, a candidate claim) is dropped here, which is why every
 * export path goes through this function.
 */
export function pickEnvelope(envelope: PredictionEnvelope): PredictionEnvelope {
  return {
    envelopeVersion: ENVELOPE_VERSION,
    requestDigest: envelope.requestDigest,
    request: pickRequest(envelope.request),
    prediction: pickPrediction(envelope.prediction),
  };
}

export async function buildPredictionEnvelope(
  request: PredictionRequestRecord,
  prediction: DriftRiskPrediction | PredictionUnavailableRecord,
): Promise<PredictionEnvelope> {
  return pickEnvelope({
    envelopeVersion: ENVELOPE_VERSION,
    requestDigest: await requestDigest(request),
    request,
    prediction,
  });
}

/** The only serialization for receipts, downloads, logs, and persisted state. */
export function serializePredictionEnvelope(envelope: PredictionEnvelope) {
  return canonicalJson(pickEnvelope(envelope));
}

/** True when the envelope's digest still matches the request it carries. */
export async function verifyEnvelopeDigest(envelope: PredictionEnvelope) {
  return envelope.requestDigest === (await requestDigest(envelope.request));
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
  envelope: PredictionEnvelope;
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
