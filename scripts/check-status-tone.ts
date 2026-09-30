import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  STATUS_KINDS,
  gatewayScrubVisible,
  outcomesVisible,
  plumbRiskVisible,
  tone,
  veilResultVisible,
} from "../src/lib/juriscore/ui/status-tone";
import { createConnectionRevisions } from "../src/lib/juriscore/gateway/session-flow";

// PLAN-6: one mapping from state to colour, green only for a real positive result, and no
// page paints green on its own.

const root = resolve(import.meta.dir, "..");

// --- The legend ------------------------------------------------------------------------
{
  const positive = ["verdict:allow", "plumb:matches", "connection:connected", "run:ok", "verify:match"];
  const caution = [
    "verdict:revise",
    "plumb:cannot_determine",
    "connection:checking",
    "gateway:recovering",
    "run:declined",
    "run:truncated",
    "risk:uncertain",
    "rule:flagged",
  ];
  const alert = [
    "verdict:block",
    "plumb:drifted",
    "connection:failed",
    "gateway:error",
    "gateway:status-failed",
    "run:blocked",
    "attempt:failed",
    "risk:high",
    "risk:failed",
    "verify:mismatch",
  ];
  const neutral = [
    "connection:not_connected",
    "gateway:locked",
    "gateway:unconfigured",
    "risk:low",
    "risk:advisory",
    "verify:pending",
    "rule:clear",
    "control:disabled",
    "sample:any",
  ];
  for (const kind of positive) assert.equal(tone(kind as never), "positive", kind);
  for (const kind of caution) assert.equal(tone(kind as never), "caution", kind);
  for (const kind of alert) assert.equal(tone(kind as never), "alert", kind);
  for (const kind of neutral) assert.equal(tone(kind as never), "neutral", kind);
  const covered = new Set([...positive, ...caution, ...alert, ...neutral]);
  for (const kind of STATUS_KINDS) assert.ok(covered.has(kind), `legend check lists ${kind}`);
  // A zero count is never coloured, whatever the state.
  assert.equal(tone("verdict:allow", 0), "neutral");
  assert.equal(tone("verdict:block", 0), "neutral");
  assert.equal(tone("verdict:allow", 1), "positive");
  assert.equal(tone("risk:low", 3), "neutral", "advisory low stays neutral with data");
}

// --- Green is painted only through the mapping ------------------------------------------
{
  const allowed = new Set([
    "src/lib/juriscore/ui/status-tone.ts",
    "src/styles.css",
    // Archived routes, out of navigation and out of scope.
    "src/routes/dashboard.analytics.tsx",
    "src/routes/dashboard.ciso.tsx",
    "src/routes/dashboard.pipeline.tsx",
    "src/routes/dashboard.use-cases.tsx",
    "src/routes/dashboard.use-cases.$key.tsx",
  ]);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(entry)) {
        const rel = relative(root, path).replace(/\\/g, "/");
        if (allowed.has(rel)) continue;
        const text = readFileSync(path, "utf8");
        if (text.includes("var(--allow)")) offenders.push(rel);
      }
    }
  };
  walk(join(root, "src"));
  assert.deepEqual(offenders, [], `green painted outside status-tone.ts: ${offenders.join(", ")}`);
}

// --- Zero states ---------------------------------------------------------------------------
{
  assert.equal(outcomesVisible(0), false, "no outcomes for an unrun tool");
  assert.equal(outcomesVisible(1), true);
  assert.equal(veilResultVisible({ raw: "", extracting: false }), false);
  assert.equal(veilResultVisible({ raw: "   \n", extracting: false }), false, "whitespace is empty");
  assert.equal(veilResultVisible({ raw: "text", extracting: true }), false, "pending extraction");
  assert.equal(veilResultVisible({ raw: "text", extracting: false }), true);
  assert.equal(plumbRiskVisible({ connected: false, sampleLoaded: false }), false);
  assert.equal(plumbRiskVisible({ connected: false, sampleLoaded: true }), true);
  assert.equal(plumbRiskVisible({ connected: true, sampleLoaded: false }), true);
  assert.equal(gatewayScrubVisible(""), false);
  assert.equal(gatewayScrubVisible("  "), false);
  assert.equal(gatewayScrubVisible("hi"), true);
}

// --- A delayed verify success cannot outlive a later failure ------------------------------
{
  const revisions = createConnectionRevisions();
  const started = revisions.current("claude-opus-5"); // verify starts
  revisions.bump("claude-opus-5"); // a prompt fails at the provider meanwhile
  assert.equal(revisions.isCurrent("claude-opus-5", started), false, "stale verify is ignored");
  const retry = revisions.current("claude-opus-5"); // Retry starts after the failure
  assert.equal(revisions.isCurrent("claude-opus-5", retry), true, "a later verify may write");
  assert.equal(revisions.isCurrent("claude-sonnet-5", 0), true, "other models are untouched");
}

console.log("JurisCore status-tone checks passed.");
