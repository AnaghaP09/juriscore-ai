/**
 * Turns raw residual-exposure examples into training rows (Phase V-B).
 *
 * Train/serve parity: each example goes through the app's real Veil engine
 * (`protectText`, with the default active policies and the Veil page's profile), and the
 * features come from the same `extractExposureFeatures` the workbench runs on Veil's
 * output. The heuristic residual rule runs on the same sanitized text.
 *
 * The label is what the predictor exists for: did Veil leave something behind?
 *   pii / secret  1 when any ground-truth sensitive value survives sanitization verbatim
 *   injection     1 when Veil raised no prompt-attack finding for it
 *   benign        0
 *
 * Usage: bun scripts/extract-exposure-features.ts <raw.jsonl> > rows.jsonl
 */
import { readFileSync } from "node:fs";
import { protectText } from "../src/lib/juriscore/veil/engine";
import {
  DEFAULT_ACTIVE_POLICY_IDS,
  policiesForFeature,
  veilScopesForPolicies,
} from "../src/lib/juriscore/policies/catalog";
import {
  EXPOSURE_FEATURE_NAMES,
  extractExposureFeatures,
} from "../src/lib/juriscore/predict/exposure-features";
import { residualRuleCheck } from "../src/lib/juriscore/predict/exposure-rule";

interface RawExample {
  source: string;
  split: "train" | "val" | "test";
  kind: "pii" | "secret" | "injection" | "benign";
  text: string;
  values: string[];
}

const PROMPT_ATTACK_CATEGORIES = new Set(["prompt_injection", "system_prompt_extraction"]);

const [rawFile] = process.argv.slice(2);
if (!rawFile) {
  console.error("usage: bun scripts/extract-exposure-features.ts <raw.jsonl>");
  process.exit(2);
}

const veilPolicies = policiesForFeature(DEFAULT_ACTIVE_POLICY_IDS, "veil");
const options = {
  profile: "all_sensitive" as const,
  policyIds: veilPolicies.map((policy) => policy.id),
  policyScopes: veilScopesForPolicies(DEFAULT_ACTIVE_POLICY_IDS),
};

const lines = readFileSync(rawFile, "utf8").split("\n").filter(Boolean);
const out: string[] = [];
const tally = new Map<string, number>();

for (const line of lines) {
  const example = JSON.parse(line) as RawExample;
  const result = protectText(example.text, options);
  const sanitized = result.sanitizedText;

  let label = 0;
  if (example.kind === "pii" || example.kind === "secret") {
    label = example.values.some((value) => sanitized.includes(value)) ? 1 : 0;
  } else if (example.kind === "injection") {
    label = result.findings.some((finding) => PROMPT_ATTACK_CATEGORIES.has(finding.category))
      ? 0
      : 1;
  }

  const features = extractExposureFeatures({
    sanitizedText: sanitized,
    profile: result.profile,
    policyIds: result.policyIds,
  });
  const rule = residualRuleCheck(sanitized);
  out.push(
    JSON.stringify({
      source: example.source,
      split: example.split,
      kind: example.kind,
      label,
      vector: EXPOSURE_FEATURE_NAMES.map((name) => features.vector[name]),
      rule: { flagged: rule.flagged ? 1 : 0, ids: rule.ruleIds },
    }),
  );
  const key = `${example.split}/${example.kind}/label=${label}`;
  tally.set(key, (tally.get(key) ?? 0) + 1);
}

process.stdout.write(out.join("\n") + "\n");
for (const [key, count] of [...tally.entries()].sort()) console.error(`${key}: ${count}`);
