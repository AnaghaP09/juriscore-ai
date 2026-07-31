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

export const validationModuleSchema = z.enum(["veil", "plumb"]);

export type ValidationModule = z.infer<typeof validationModuleSchema>;

export const evaluationMaturitySchema = z.enum([
  "target",
  "synthetic",
  "benchmark",
  "pilot",
  "production",
]);

export type EvaluationMaturity = z.infer<typeof evaluationMaturitySchema>;

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
});

export type ValidationReceipt = z.infer<typeof validationReceiptSchema>;

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
    description: "Open-source AI validation and guardrails. Protect the prompt. Prove the answer.",
  },
  modules: {
    veil: {
      key: "veil",
      name: "JurisCore Veil",
      description: "Protects sensitive information before and after model use.",
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
