import { z } from "zod";

export const evidenceSourceKindSchema = z.enum([
  "model_input",
  "model_output",
  "denial_notice",
  "payer_policy",
  "claim_record",
  "clinical_record",
  "internal_policy",
  "source_code",
  "configuration",
  "api_schema",
  "documentation",
  "help_center",
  "sales_material",
]);

export type EvidenceSourceKind = z.infer<typeof evidenceSourceKindSchema>;

export const evidenceReferenceSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1),
  locator: z.string().min(1),
  excerpt: z.string().min(1).optional(),
});

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const assertionStatusSchema = z.enum(["supported", "contradicted", "insufficient_evidence"]);

export type AssertionStatus = z.infer<typeof assertionStatusSchema>;

export const governedAssertionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    material: z.boolean(),
    status: assertionStatusSchema,
    evidence: z.array(evidenceReferenceSchema),
    reason: z.string().min(1),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .superRefine((assertion, context) => {
    if (assertion.status !== "insufficient_evidence" && assertion.evidence.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: "Supported and contradicted assertions require source evidence.",
      });
    }
  });

export type GovernedAssertion = z.infer<typeof governedAssertionSchema>;

export const reviewStatusSchema = z.enum(["pending", "approved", "rejected", "changes_requested"]);

export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const reviewDecisionSchema = z
  .object({
    status: reviewStatusSchema,
    reviewerId: z.string().min(1).optional(),
    rationale: z.string().min(1).optional(),
    decidedAt: z.string().datetime().optional(),
  })
  .superRefine((review, context) => {
    if (review.status === "pending") return;

    for (const field of ["reviewerId", "rationale", "decidedAt"] as const) {
      if (!review[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for a completed review.`,
        });
      }
    }
  });

export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const validatorVerdictSchema = z.enum(["allow", "revise", "block"]);

export type ValidatorVerdict = z.infer<typeof validatorVerdictSchema>;

export const validationModuleSchema = z.enum(["veil", "plumb", "gateway"]);

export type ValidationModule = z.infer<typeof validationModuleSchema>;

/**
 * What a receipt's `inputDigest` covers, and therefore how it can be re-checked. A receipt
 * without the field predates it and is read as the v1 of its module.
 */
export const digestVersionSchema = z.enum([
  "veil.raw-text.v1",
  "plumb.claims.v1",
  "plumb.sources.v2",
  "gateway.request.v1",
]);

export type DigestVersion = z.infer<typeof digestVersionSchema>;

export const evaluationMaturitySchema = z.enum([
  "target",
  "synthetic",
  "benchmark",
  "pilot",
  "production",
]);

export type EvaluationMaturity = z.infer<typeof evaluationMaturitySchema>;

/**
 * Version of the drift-risk feature vector. Weights record the version they were fitted
 * against, and a prediction carrying any other version is rejected rather than scored
 * against coefficients that mean something else.
 */
export const DRIFT_FEATURES_VERSION = "drift-features.v1";

export const driftRiskTierSchema = z.enum(["free", "paid"]);

export type DriftRiskTier = z.infer<typeof driftRiskTierSchema>;

export const driftRiskEngineSchema = z.enum(["local-logistic", "provider-model"]);

export type DriftRiskEngine = z.infer<typeof driftRiskEngineSchema>;

export const driftRiskBandSchema = z.enum(["low", "uncertain", "high"]);

export type DriftRiskBand = z.infer<typeof driftRiskBandSchema>;

export const driftRiskContributionSchema = z.object({
  feature: z.string().min(1),
  value: z.number().finite(),
  weight: z.number().finite(),
  contribution: z.number().finite(),
});

export type DriftRiskContribution = z.infer<typeof driftRiskContributionSchema>;

/**
 * An advisory estimate that a code change needs a documentation update. It carries no
 * verdict and cannot produce one: allow / revise / block come only from Plumb's
 * comparison of claims.
 */
export const driftRiskPredictionSchema = z
  .object({
    tier: driftRiskTierSchema,
    engine: driftRiskEngineSchema,
    modelId: z.string().min(1),
    modelVersion: z.string().min(1),
    featuresVersion: z.literal(DRIFT_FEATURES_VERSION),
    score: z.number().min(0).max(1),
    band: driftRiskBandSchema,
    contributions: z.array(driftRiskContributionSchema).min(1),
    maturity: evaluationMaturitySchema,
    deterministic: z.boolean(),
  })
  .superRefine((prediction, context) => {
    // The local engine is a fixed dot product; a model-backed one is not reproducible
    // and must never be presented as if it were.
    const expected = prediction.engine === "local-logistic";
    if (prediction.deterministic !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic"],
        message: expected
          ? "The local predictor is deterministic."
          : "A model-backed prediction is not reproducible and must be marked non-deterministic.",
      });
    }
  });

export type DriftRiskPrediction = z.infer<typeof driftRiskPredictionSchema>;

export const validationReceiptSchema = z.object({
  id: z.string().min(1),
  module: validationModuleSchema,
  policyVersion: z.string().min(1),
  inputDigest: z.string().min(1),
  verdict: validatorVerdictSchema,
  findingIds: z.array(z.string().min(1)),
  evidence: z.array(evidenceReferenceSchema),
  maturity: evaluationMaturitySchema,
  createdAt: z.string().datetime(),
  digestVersion: digestVersionSchema.optional(),
  /** Plumb v2 only: digest of the diff and each document's content, separate from claims. */
  sourceDigest: z.string().min(1).optional(),
  /** Gateway only: digest of the sanitized payload that left the process. */
  outboundDigest: z.string().min(1).optional(),
});

export type ValidationReceipt = z.infer<typeof validationReceiptSchema>;

/**
 * The only receipt shape that is stored, written to a folder, downloaded, or exported.
 * Strict at every level: evidence carries references with no `excerpt`, and any key not
 * listed here is rejected rather than carried along.
 */
export const persistedEvidenceReferenceSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceVersion: z.string().min(1),
    locator: z.string().min(1),
  })
  .strict();

export const persistedReceiptSchema = z
  .object({
    id: z.string().min(1),
    module: validationModuleSchema,
    policyVersion: z.string().min(1),
    inputDigest: z.string().min(1),
    verdict: validatorVerdictSchema,
    findingIds: z.array(z.string().min(1)),
    evidence: z.array(persistedEvidenceReferenceSchema),
    maturity: evaluationMaturitySchema,
    createdAt: z.string().datetime(),
    digestVersion: digestVersionSchema.optional(),
    sourceDigest: z.string().min(1).optional(),
    outboundDigest: z.string().min(1).optional(),
  })
  .strict();

export type PersistedReceipt = z.infer<typeof persistedReceiptSchema>;

export const auditEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  subjectId: z.string().min(1),
  caseId: z.string().min(1).optional(),
  eventType: z.string().min(1),
  actorId: z.string().min(1),
  occurredAt: z.string().datetime(),
  previousEventId: z.string().min(1).nullable(),
  payloadDigest: z.string().min(1),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const reclaimCaseSchema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    title: z.string().min(1),
    evidenceSourceIds: z.array(z.string().min(1)),
    assertions: z.array(governedAssertionSchema),
    review: reviewDecisionSchema,
  })
  .superRefine((reclaimCase, context) => {
    if (reclaimCase.review.status !== "approved") return;

    reclaimCase.assertions.forEach((assertion, index) => {
      if (assertion.material && assertion.status !== "supported") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assertions", index, "status"],
          message: "An approved case cannot contain an unsupported material assertion.",
        });
      }
    });
  });

export type ReclaimCase = z.infer<typeof reclaimCaseSchema>;

export const JURISCORE_PRODUCT = {
  platform: {
    key: "juriscore",
    name: "JurisCore",
    description: "Commercial AI validation and guardrails. Protect the prompt. Prove the answer.",
  },
  features: {
    veil: {
      key: "veil",
      name: "Veil",
      description: "Protects customer, operational, security, and regulated data around model use.",
    },
    plumb: {
      key: "plumb",
      name: "Plumb",
      description: "Checks SaaS assertions against implemented sources of truth.",
    },
  },
  roadmap: {
    reclaim: {
      key: "reclaim",
      name: "JurisCore Reclaim",
      description: "Future denial-evidence and appeal-preparation workflow.",
    },
  },
} as const;
