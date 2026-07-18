import { defineMcp } from "@lovable.dev/mcp-js";
import checkPrompt from "./tools/check-prompt";
import retrievePolicy from "./tools/retrieve-policy";
import enforceCitations from "./tools/enforce-citations";
import evaluateResponse from "./tools/evaluate-response";
import getAuditEntry from "./tools/get-audit-entry";
import getMetrics from "./tools/get-metrics";

export default defineMcp({
  name: "juriscore-ai",
  title: "JurisCore AI — Compliance Guardrails",
  version: "0.1.0",
  instructions:
    "JurisCore AI is a universal governance middleware for regulated domains (Finance, Healthcare). Use `check_prompt` before sending any user prompt to a model, `retrieve_policy` to ground answers in an approved rulebook (SEC/FINRA/HIPAA/CMS), `enforce_citations` to verify a draft response is grounded, and `evaluate_response` to run the full pipeline in one call. `get_audit_entry` and `get_metrics` provide governance visibility.",
  tools: [checkPrompt, retrievePolicy, enforceCitations, evaluateResponse, getAuditEntry, getMetrics],
});
