import { defineMcp } from "@lovable.dev/mcp-js";
import checkPrompt from "./tools/check-prompt";
import retrievePolicy from "./tools/retrieve-policy";
import compareClaims from "./tools/compare-claims";
import enforceCitations from "./tools/enforce-citations";
import evaluateResponse from "./tools/evaluate-response";
import getAuditEntry from "./tools/get-audit-entry";

export default defineMcp({
  name: "juriscore-ai",
  title: "JurisCore — AI validation and guardrails",
  version: "0.1.0",
  instructions:
    "JurisCore is an AI validation and guardrail platform that runs inside the operator's own environment — on-premises, private cloud, or air-gapped. Two features share one policy library: Veil controls what enters and leaves a model, and Plumb checks assertions against the implemented source of truth. Every check returns allow, revise, or block with findings and the active policy versions. Call `check_prompt` before sending any text to a model; `retrieve_policy` for the pack catalog and versions; `compare_claims` to validate structured assertions against authoritative values; `evaluate_response` to run Veil on a prompt and a draft answer, plus the Plumb comparison when structured claims are supplied. Evaluation is local and deterministic: no external call is made, and no prompt, draft, or detected value is ever returned or logged — findings carry category, severity, and count only. This build persists nothing and is unauthenticated, so `enforce_citations` and `get_audit_entry` report themselves unavailable rather than return fabricated results. JurisCore guides checks against published references; it does not determine legal applicability or certify compliance.",
  // Sovereign deployment: no usage telemetry leaves the operator's environment.
  metrics: false,
  tools: [
    checkPrompt,
    retrievePolicy,
    compareClaims,
    evaluateResponse,
    enforceCitations,
    getAuditEntry,
  ],
});
