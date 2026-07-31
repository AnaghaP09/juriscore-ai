# Prototype gap analysis

The exported Lovable project is a valuable interaction and design baseline. The implementation will evolve it additively and preserve its current surfaces while replacing simulated behavior incrementally.

| Area            | Current prototype                                                         | Required product state                                                                                           | Priority |
| --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Product story   | Broad governance and legal-operations workspace                           | JurisCore protects model inputs and validates assertions; Veil and Plumb are the flagship modules                | Now      |
| Veil            | Generic redaction sandbox with in-component patterns                      | Configurable healthcare privacy engine, safe finding objects, input/output verdicts, tests, and later server API | P0       |
| Plumb           | Interactive docs-versus-code drift demonstration                          | Reusable source-claim comparator with supported, drifted, and cannot-determine results plus exact references     | P0       |
| Data            | Deterministic generated records and in-memory state                       | Tenant-scoped persistence with versioned sources and migrations                                                  | P0       |
| Retrieval       | Small hard-coded policy list with keyword scoring and random tie-breaking | Versioned source ingestion, deterministic retrieval, exact locators, and retrieval evaluation                    | P0       |
| Citations       | String matching against policy identifiers                                | Assertion-level source checks with resolvable references and abstention                                          | P0       |
| Review          | Demonstration interactions                                                | Persisted reviewer identity, status transition, rationale, timestamps, and authorization                         | P0       |
| Audit           | Synthetic IDs and generated metrics                                       | Append-only receipts tied to tenant, source versions, policy, model metadata, and reviewer actions               | P0       |
| Access control  | Public prototype routes and tools                                         | Authentication, role-based authorization, tenant isolation, and protected server tools                           | P0       |
| Model execution | Simulated selector with hard-coded metadata                               | Provider adapter, server-side secrets, timeouts, structured outputs, and usage records                           | P1       |
| Metrics         | Simulated operational and outcome claims                                  | Reproducible evaluations with maturity labels                                                                    | P0       |
| Interface       | Broad Lovable dashboard                                                   | Preserve existing routes; foreground Veil and Plumb; refine in Lovable after contracts stabilize                 | P1       |

## First vertical slices

### Veil

1. accept synthetic healthcare text;
2. detect configured sensitive categories;
3. redact or tokenize without returning raw values in findings;
4. preserve permitted clinical context;
5. show raw and sanitized verdicts;
6. verify the behavior with deterministic checks.

### Plumb

1. accept structured implementation facts and document assertions;
2. compare values only when their subjects and units are compatible;
3. return matches, drifted, or cannot determine;
4. attach exact references to both sides;
5. verify the behavior with deterministic checks.
