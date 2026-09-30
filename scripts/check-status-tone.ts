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
import {
  formatVolume,
  gatewayBanner,
  gatewayScrub,
  overviewTool,
  plumbSampleMode,
  veilStatus,
} from "../src/lib/juriscore/ui/presentation";

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

// --- Rendered strings, through the production presentation helpers (inspection r1, #10) ---
{
  // Veil: empty, whitespace and extracting input show no result and no claim.
  const base = { isSample: false, sanitizedVerdict: "allow" as const, requiresReview: false, strategy: "redact" as const };
  for (const raw of ["", "   ", "\n\t"]) {
    const view = veilStatus({ ...base, raw, extracting: false });
    assert.equal(view.showResult, false);
    assert.equal(view.badgeText, "No input yet");
    assert.equal(view.tone, "neutral");
    assert.ok(view.statusText.startsWith("Upload a document or enter text"), view.statusText);
  }
  const pending = veilStatus({ ...base, raw: "text", extracting: true });
  assert.equal(pending.showResult, false);
  assert.ok(pending.statusText.startsWith("Extracting"), pending.statusText);
  // Review required is amber even when the engine verdict is allow (#5).
  const review = veilStatus({ ...base, raw: "mail maya@example.test", extracting: false, requiresReview: true });
  assert.equal(review.showResult, true);
  assert.equal(review.tone, "caution");
  assert.equal(review.badgeText, "ALLOW · REVIEW");
  assert.equal(review.statusText, "Review required before sending");
  const clean = veilStatus({ ...base, raw: "hello", extracting: false });
  assert.equal(clean.tone, "positive");
  assert.equal(clean.badgeText, "ALLOW");
  assert.equal(clean.statusText, "Redacted · ready to send");
  const blocked = veilStatus({ ...base, raw: "x", extracting: false, sanitizedVerdict: "block" });
  assert.equal(blocked.tone, "alert");
  assert.equal(blocked.statusText, "Blocked: do not send");
  // A sample is neutral whatever the verdict.
  const sample = veilStatus({ ...base, raw: "x", extracting: false, isSample: true, sanitizedVerdict: "block" });
  assert.equal(sample.tone, "neutral");
  assert.equal(sample.badgeText, "BLOCK");

  // Overview: an unrun tool shows neither outcomes nor supporting metrics nor bands (#6).
  const unrun = overviewTool({ checks: 0, chars: 0, bands: { low: 0, uncertain: 0, high: 0 } });
  assert.equal(unrun.showOutcomes, false);
  assert.equal(unrun.showDetails, false);
  assert.equal(unrun.bands, undefined);
  assert.equal(unrun.volumeLabel, "0 KB", "zero volume is not rounded up to 1 KB");
  assert.ok(unrun.emptyText.startsWith("No checks on this device yet"));
  const run = overviewTool({ checks: 3, chars: 1500, bands: { low: 0, uncertain: 0, high: 0 } });
  assert.equal(run.showOutcomes, true);
  assert.equal(run.bands, undefined, "zero-valued bands are not shown");
  assert.deepEqual(overviewTool({ checks: 3, bands: { low: 1, uncertain: 0, high: 0 } }).bands, { low: 1, uncertain: 0, high: 0 });
  assert.equal(formatVolume(2048), "2 KB");

  // Gateway banner: every phase names its state with the right tone (#9).
  const banner = (input: Parameters<typeof gatewayBanner>[0]) => gatewayBanner(input);
  const off = { checking: false, recovering: false };
  assert.deepEqual(banner({ phase: "loading", ...off }), { kind: "connection:checking", text: "Loading gateway status…" });
  assert.equal(banner({ phase: "unavailable", unavailableReason: "error", message: "boom", ...off })?.kind, "gateway:error");
  assert.ok(banner({ phase: "unavailable", unavailableReason: "error", message: "boom", ...off })?.text.includes("boom"));
  assert.equal(banner({ phase: "unavailable", unavailableReason: "disabled", ...off })?.kind, "gateway:unconfigured");
  assert.equal(banner({ phase: "status-unknown", checking: true, recovering: true })?.kind, "gateway:recovering");
  assert.equal(banner({ phase: "status-unknown", checking: false, recovering: false })?.kind, "gateway:status-failed");
  assert.equal(banner({ phase: "locked", ...off })?.kind, "gateway:locked");
  assert.equal(banner({ phase: "ready", configured: false, ...off })?.kind, "gateway:unconfigured");
  assert.equal(banner({ phase: "ready", configured: true, connectionState: "not_connected", checking: true, recovering: false })?.kind, "connection:checking");
  assert.equal(banner({ phase: "ready", configured: true, connectionState: "failed", connectionError: "API key rejected", ...off })?.kind, "connection:failed");
  assert.ok(banner({ phase: "ready", configured: true, connectionState: "failed", connectionError: "API key rejected", ...off })?.text.includes("API key rejected"));
  assert.equal(banner({ phase: "ready", configured: true, connectionState: "connected", ...off }), null);
  assert.equal(banner({ phase: "ready", configured: true, connectionState: "not_connected", ...off })?.kind, "connection:not_connected");

  // Gateway scrub: hidden for an empty prompt; green only for allow without review (#5).
  assert.equal(gatewayScrub({ prompt: "", blocked: false, sanitizedVerdict: "allow", requiresReview: false }).visible, false);
  const safe = gatewayScrub({ prompt: "hi", blocked: false, sanitizedVerdict: "allow", requiresReview: false });
  assert.equal(safe.sendKind, "verdict:allow");
  assert.equal(safe.sendText, "Safe to send after protection");
  const reviewed = gatewayScrub({ prompt: "mail maya@example.test", blocked: false, sanitizedVerdict: "allow", requiresReview: true });
  assert.equal(reviewed.sendKind, "verdict:revise");
  assert.equal(reviewed.sendText, "Review before sending");
  assert.equal(gatewayScrub({ prompt: "x", blocked: true, sanitizedVerdict: "block", requiresReview: false }).sendText, "Will not be sent");

  // Plumb: a sample on either side makes the comparison a sample (#3).
  assert.equal(plumbSampleMode({ showsSampleCode: true }), true);
  assert.equal(plumbSampleMode({ showsSampleCode: false, selectedDocKind: "sample" }), true);
  assert.equal(plumbSampleMode({ showsSampleCode: false, selectedDocKind: "upload" }), false);
}

console.log("JurisCore status-tone checks passed.");
