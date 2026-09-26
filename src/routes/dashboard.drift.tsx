import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import {
  Sparkles,
  GitPullRequest,
  Lock,
  AlertOctagon,
  CheckCircle2,
  Download,
  HelpCircle,
  BookOpen,
  Upload,
} from "lucide-react";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import { stampCheck } from "@/lib/juriscore/metrics-ledger";
import { compareClaims, type PlumbClaim, type PlumbResult } from "@/lib/juriscore/plumb/engine";
import { policiesForFeature } from "@/lib/juriscore/policies/catalog";
import { createReceipt, downloadReceipt } from "@/lib/juriscore/core/receipts";
import { plumbReceiptInput } from "@/lib/juriscore/plumb/receipt";
import type { ValidationReceipt } from "@/lib/juriscore/core/contracts";
import { ReceiptSummary } from "@/components/receipt-summary";
import { PlumbSources } from "@/components/plumb-sources";
import {
  BUILT_IN_SUBJECTS,
  claimsFromDiff,
  claimsFromDocument,
  documentSentences,
  parseSourceSnapshot,
  parseUnifiedDiff,
  type DiffLine,
} from "@/lib/juriscore/plumb/sources";
import type { ActivePredictionRequest } from "@/lib/juriscore/predict/envelope";
import {
  parseConnectedChange,
  recordCheckWithRisk,
  retireWorkbenchRisk,
  startWorkbenchRiskScoring,
  topContributions,
  visibleWorkbenchRisk,
  type AcceptedWorkbenchRisk,
  type WorkbenchRiskInputs,
  type WorkbenchRiskView,
} from "@/lib/juriscore/predict/workbench";

export const Route = createFileRoute("/dashboard/drift")({
  head: () => ({
    meta: [
      { title: "Drift Workbench — JurisCore AI" },
      {
        name: "description",
        content: "Detect PR-versus-prose contradictions with cited source comparisons.",
      },
    ],
  }),
  component: DriftView,
});

// The risky pull request raises both audited values, contradicting the documents.
const DRIFT_DIFF_LINES: DiffLine[] = [
  { n: 40, kind: "ctx", text: "export const payments = {" },
  { n: 41, kind: "del", text: "  kycThreshold: 10_000," },
  { n: 42, kind: "add", text: "  kycThreshold: 25_000," },
  { n: 43, kind: "ctx", text: '  currency: "USD",' },
  { n: 44, kind: "del", text: "  crossBorderFeeBps: 100, // 1.0%" },
  { n: 45, kind: "add", text: "  crossBorderFeeBps: 250, // 2.5%" },
  { n: 46, kind: "ctx", text: "};" },
];

// The safe pull request leaves the audited values untouched and changes something else.
// Plumb reports drift; it never edits code, so showing a "corrected" line here would
// claim a capability the product does not have.
const CLEAN_DIFF_LINES: DiffLine[] = [
  { n: 40, kind: "ctx", text: "export const payments = {" },
  { n: 41, kind: "ctx", text: "  // thresholds owned by compliance-config" },
  { n: 42, kind: "ctx", text: "  kycThreshold: 10_000," },
  { n: 43, kind: "del", text: "  retryLimit: 3," },
  { n: 44, kind: "add", text: "  retryLimit: 5," },
  { n: 45, kind: "ctx", text: "  crossBorderFeeBps: 100, // 1.0%" },
  { n: 46, kind: "ctx", text: "};" },
];

/**
 * The built-in sample change as a unified diff, so the drift-risk predictor can score it
 * exactly as it scores a pasted diff. Sample scores are shown but never recorded.
 */
function sampleDiffText(lines: DiffLine[]) {
  const oldCount = lines.filter((line) => line.kind !== "add").length;
  const newCount = lines.filter((line) => line.kind !== "del").length;
  const start = lines[0]?.n ?? 1;
  const body = lines.map(
    (line) => `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${line.text}`,
  );
  return [
    "diff --git a/payments.ts b/payments.ts",
    "--- a/payments.ts",
    "+++ b/payments.ts",
    `@@ -${start},${oldCount} +${start},${newCount} @@`,
    ...body,
  ].join("\n");
}

/**
 * Sample documents the workbench can load on demand so it demonstrates itself with
 * nothing connected. They become ordinary uploaded documents once loaded — there is one
 * document model, so a sample and a real filing behave identically.
 */
const SAMPLE_DOCUMENTS: Array<{ name: string; text: string }> = [
  {
    name: "sec-10k-excerpt.txt",
    text: [
      "Our Know-Your-Customer program applies enhanced due diligence to any single transaction exceeding $10,000, consistent with BSA/AML expectations.",
      "Cross-border remittance fees disclosed to retail customers remain capped at 1.0% of principal for the reporting period.",
      "The Company maintains independent oversight of all pricing changes through the Fee Review Committee.",
    ].join("\n"),
  },
  {
    name: "sales-deck-slide-12.txt",
    text: [
      "Send money across 40 markets with a flat 1% cross-border fee — the lowest transparent rate in the segment.",
      "KYC verification runs automatically for any transaction over $10K.",
    ].join("\n"),
  },
  {
    name: "internal-pricing-policy.txt",
    text: [
      "Fee schedule changes require CFO sign-off and a 30-day customer notice.",
      "KYC monetary thresholds are governed centrally and cannot be adjusted at the product layer.",
    ].join("\n"),
  },
];

const sourceReference = (sourceId: string, locator: string) => ({
  sourceId,
  sourceVersion: "synthetic-pr-2431",
  locator,
});

function codeClaims(driftMode: "clean" | "drift"): PlumbClaim[] {
  return [
    {
      id: "code-kyc",
      subject: "kyc_threshold",
      value: driftMode === "drift" ? 25_000 : 10_000,
      unit: "USD",
      statement: driftMode === "drift" ? "kycThreshold: 25_000" : "kycThreshold: 10_000",
      reference: sourceReference("payments.ts", "line 42"),
    },
    {
      id: "code-fee",
      subject: "cross_border_fee",
      value: driftMode === "drift" ? 2.5 : 1,
      unit: "percent",
      statement: driftMode === "drift" ? "crossBorderFeeBps: 250" : "crossBorderFeeBps: 100",
      reference: sourceReference("payments.ts", "line 45"),
    },
  ];
}

const SUBJECT_LABEL = new Map(BUILT_IN_SUBJECTS.map((subject) => [subject.id, subject.label]));

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  drifted: { label: "Contradiction", tone: "text-[color:var(--block)]" },
  cannot_determine: { label: "Cannot determine", tone: "text-[color:var(--revise)]" },
  matches: { label: "Agrees", tone: "text-[color:var(--allow)]" },
};

/** A claim's value and where it was read from, as one cell. */
function ClaimCell({
  claim,
}: {
  claim: { value: unknown; unit?: string; reference: { locator: string } } | null;
}) {
  if (!claim) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-mono text-xs">
      {String(claim.value)}
      {claim.unit ? ` ${claim.unit}` : ""}
      <span className="text-muted-foreground"> · {claim.reference.locator}</span>
    </span>
  );
}

/** One citable line of a document. `locator` is set only when it contradicts the code. */
function DocumentSentenceLine({ text, locator }: { text: string; locator?: string }) {
  const hit = Boolean(locator);
  return (
    <p
      className={`text-sm leading-relaxed p-2 rounded-md border transition-colors ${
        hit
          ? "border-[color:var(--block)]/60 bg-[color:var(--block)]/10 text-foreground"
          : "border-transparent text-muted-foreground"
      }`}
    >
      {hit && (
        <span className="inline-block mr-2 text-[10px] font-mono text-[color:var(--block)] uppercase">
          Contradicts +{locator}
        </span>
      )}
      {text}
    </p>
  );
}

type RiskView = WorkbenchRiskView;

const BAND_COPY: Record<"low" | "uncertain" | "high", { label: string; tone: string }> = {
  low: { label: "Low", tone: "text-[color:var(--allow)] border-[color:var(--allow)]/40" },
  uncertain: {
    label: "Uncertain",
    tone: "text-[color:var(--revise)] border-[color:var(--revise)]/40",
  },
  high: { label: "High", tone: "text-[color:var(--block)] border-[color:var(--block)]/40" },
};

const featureLabel = (feature: string) => feature.replace(/_/g, " ");

/**
 * The advisory drift-risk band for the connected change. It sits beside the comparison
 * and never feeds it, so nothing here can change what the check reports.
 */
function DriftRiskPanel({
  risk,
  hasConnectedChange,
  showsSampleCode,
}: {
  risk: RiskView | null;
  hasConnectedChange: boolean;
  showsSampleCode: boolean;
}) {
  const scored = risk?.status === "scored" ? risk : null;
  const maturityLabel = scored
    ? `${scored.maturity}${scored.placeholder ? " · placeholder weights" : ""}`
    : "target · placeholder weights";
  const docsTouched = risk && risk.status !== "failed" ? risk.docsTouched : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Drift risk</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Free · local</Badge>
            <Badge variant="outline" className="text-[color:var(--revise)]">
              {maturityLabel}
            </Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm" aria-live="polite">
        {!hasConnectedChange && showsSampleCode && (
          <div className="text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-2">
              sample · not recorded
            </Badge>
            Scored on the built-in sample change. Connect a pull request or paste a diff to score
            your own change and add it to this device&apos;s history.
          </div>
        )}
        {!hasConnectedChange && !showsSampleCode ? (
          <p className="text-muted-foreground">
            Connect a pull request or paste a diff to see how likely it is that its docs need
            updating.
          </p>
        ) : risk === null ? (
          <p className="text-muted-foreground">Scoring the connected change…</p>
        ) : risk.status === "failed" ? (
          <p className="text-muted-foreground">Risk could not be computed for this change.</p>
        ) : risk.status === "unavailable" ? (
          <div>
            <div className="font-medium">
              Risk unavailable: {risk.reason === "no-baseline" ? "no baseline" : "no code files"}
            </div>
            <p className="text-xs text-muted-foreground">
              {risk.reason === "no-baseline"
                ? "A whole file was supplied rather than a change, so there is nothing that changed to score."
                : "This change touches only documentation, so there is no code change to score."}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-semibold">{risk.score}</span>
                <span className="text-xs text-muted-foreground">/ 100</span>
                <Badge variant="outline" className={BAND_COPY[risk.band].tone}>
                  {BAND_COPY[risk.band].label}
                </Badge>
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Risk score · {maturityLabel}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">Top contributing features</div>
              {topContributions(risk.contributions).length === 0 ? (
                <p className="text-xs text-muted-foreground">No feature raised the score.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 font-mono text-xs">
                  {topContributions(risk.contributions).map((contribution) => (
                    <li key={contribution.feature}>
                      {featureLabel(contribution.feature)}{" "}
                      <span className="text-muted-foreground">
                        +{contribution.contribution.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {docsTouched.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Docs already touched in this change:{" "}
            <span className="font-mono">{docsTouched.join(", ")}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Advisory only — does not change the verdict.
        </p>
      </CardContent>
    </Card>
  );
}

function DriftView() {
  const {
    driftMode,
    setDriftMode,
    killSwitch,
    activePolicyIds,
    customPolicies,
    recordPlumbCheck,
    recordReceipt,
    connectedRepository,
    setConnectedRepository,
    sourceDocuments,
    addSourceDocument,
    removeSourceDocument,
  } = useDemoStore();
  const [doc, setDoc] = useState<string>("sec");
  const [ran, setRan] = useState(false);
  const [evaluation, setEvaluation] = useState<PlumbResult | null>(null);
  const [receipt, setReceipt] = useState<ValidationReceipt | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [runWarning, setRunWarning] = useState<string | null>(null);
  const activePlumbPolicies = useMemo(
    () => policiesForFeature(activePolicyIds, "plumb", customPolicies),
    [activePolicyIds, customPolicies],
  );

  // A connected pull request replaces the built-in sample on the code side; the sample
  // stays available so the workbench still demonstrates itself with nothing connected.
  const parsedDiff = useMemo(() => {
    if (!connectedRepository) return null;
    // Anything that is not a diff is read as the current state of a source file, so
    // pasting or pointing at the file that holds the values works as well as a change.
    return (
      parseUnifiedDiff(connectedRepository.diff)[0] ??
      parseSourceSnapshot(connectedRepository.diff, connectedRepository.sourcePath ?? "source")
    );
  }, [connectedRepository]);

  // The document side is entirely what the user supplied. With nothing uploaded there
  // are no tabs to show rather than stale samples standing in for real documents.
  const selectedDoc =
    sourceDocuments.find((document) => document.id === doc) ?? sourceDocuments[0] ?? null;

  // The built-in sample change only stands in while the workbench is demonstrating itself.
  // Once the user supplies a document of their own, comparing it against invented code
  // would report findings about a pull request that does not exist, so the code side
  // stays empty until they connect a real change.
  const hasUserDocuments = sourceDocuments.some((document) => document.kind !== "sample");
  const showsSampleCode = !connectedRepository && !hasUserDocuments;
  // A connected change with no recognised subject still runs: the check then reports what
  // it cannot determine instead of refusing to start.
  const hasCodeSource = Boolean(connectedRepository) || showsSampleCode;

  const authorities = useMemo(() => {
    if (!parsedDiff || !connectedRepository) return showsSampleCode ? codeClaims(driftMode) : [];
    return claimsFromDiff(
      parsedDiff,
      BUILT_IN_SUBJECTS,
      connectedRepository.pullNumber
        ? `pr-${connectedRepository.pullNumber}`
        : connectedRepository.loadedAt,
    );
  }, [parsedDiff, connectedRepository, driftMode, showsSampleCode]);

  const selectedSentences = useMemo(
    () => (selectedDoc ? documentSentences(selectedDoc.text) : []),
    [selectedDoc],
  );

  const assertions = useMemo(() => {
    if (!selectedDoc) return [];
    return claimsFromDocument(selectedSentences, BUILT_IN_SUBJECTS, {
      sourceId: selectedDoc.name,
      sourceVersion: selectedDoc.uploadedAt,
    });
  }, [selectedDoc, selectedSentences]);

  // The advisory drift-risk band reads every parsed file of the connected change, not
  // only the one Plumb shows, and learns how the text was read from the parser itself.
  const connectedChange = useMemo(
    () =>
      connectedRepository
        ? parseConnectedChange(connectedRepository.diff, connectedRepository.sourcePath)
        : null,
    [connectedRepository],
  );
  const riskDocuments = useMemo(
    () => (selectedDoc ? [{ id: selectedDoc.id, content: selectedDoc.text }] : []),
    [selectedDoc],
  );
  const riskPolicyConfig = useMemo(
    () => ({
      policies: activePlumbPolicies.map((policy) => ({ id: policy.id, version: policy.version })),
    }),
    [activePlumbPolicies],
  );
  // Bumped by resetRun so a reset always starts a fresh scoring request.
  const [riskRun, setRiskRun] = useState(0);
  // With nothing of the user's loaded, the sample change is scored too so the band is
  // always visible; it is labelled as a sample and never enters the device history.
  const scoredChange = useMemo(
    () =>
      connectedChange ??
      (showsSampleCode
        ? parseConnectedChange(
            sampleDiffText(driftMode === "drift" ? DRIFT_DIFF_LINES : CLEAN_DIFF_LINES),
            "payments.ts",
          )
        : null),
    [connectedChange, showsSampleCode, driftMode],
  );
  const riskInputs = useMemo<WorkbenchRiskInputs>(
    () => ({
      change: scoredChange,
      documents: riskDocuments,
      policyConfig: riskPolicyConfig,
      run: riskRun,
    }),
    [scoredChange, riskDocuments, riskPolicyConfig, riskRun],
  );
  const [acceptedRisk, setAcceptedRisk] = useState<AcceptedWorkbenchRisk | null>(null);
  // Scoring is asynchronous, so a result is accepted only while the request that produced
  // it is still the active one (same generation, same request digest), and shown only
  // while it still answers the current inputs and generation.
  const riskGeneration = useRef(0);
  const activeRisk = useRef<ActivePredictionRequest | null>(null);
  const riskRefs = useMemo(() => ({ generation: riskGeneration, active: activeRisk }), []);

  // A source, document, or policy change, a reset, or unmount retires the request.
  useEffect(
    () => startWorkbenchRiskScoring(riskInputs, riskRefs, setAcceptedRisk),
    [riskInputs, riskRefs],
  );
  const risk: RiskView | null = visibleWorkbenchRisk(
    acceptedRisk,
    riskInputs,
    riskGeneration.current,
  );

  const loadSampleDocuments = () => {
    const now = new Date().toISOString();
    for (const sample of SAMPLE_DOCUMENTS) {
      addSourceDocument({
        id: `sample-${sample.name}`,
        name: sample.name,
        kind: "sample",
        text: sample.text,
        uploadedAt: now,
      });
    }
    setDoc(`sample-${SAMPLE_DOCUMENTS[0].name}`);
    resetRun();
  };

  const runJudge = () => {
    if (killSwitch) return;
    // The button stays clickable so the user learns what is missing instead of facing a
    // silently greyed-out control.
    if (!selectedDoc || !hasCodeSource) {
      setRunWarning(
        !selectedDoc && !hasCodeSource
          ? "Nothing to compare yet. Connect a pull request or paste a diff, and upload a document that makes claims about it."
          : !selectedDoc
            ? "Upload a document to check. Plumb compares what your documents say against the connected change."
            : "Connect a pull request or paste a diff. Plumb needs a code change to compare your documents against.",
      );
      return;
    }
    setRunWarning(null);
    setReceipt(null);
    setReceiptError(null);
    const nextEvaluation = compareClaims(authorities, assertions, {
      policyIds: activePlumbPolicies.map((policy) => policy.id),
    });
    setRan(true);
    setEvaluation(nextEvaluation);
    // The check is recorded once, with the prediction for these exact inputs, even when
    // the panel is still scoring them. The verdict above is already final, and the stamp
    // taken here dates the check however long its prediction takes.
    void recordCheckWithRisk(
      {
        ...stampCheck(),
        verdict: nextEvaluation.verdict,
        assertions: nextEvaluation.findings.length,
        matches: nextEvaluation.counts.matches,
        drifted: nextEvaluation.counts.drifted,
        cannotDetermine: nextEvaluation.counts.cannot_determine,
      },
      connectedChange,
      { documents: riskDocuments, policyConfig: riskPolicyConfig },
      recordPlumbCheck,
    );
  };

  const openDocumentPicker = useRef<(() => void) | null>(null);
  const registerUploadTrigger = useCallback((open: () => void) => {
    openDocumentPicker.current = open;
  }, []);

  const resetRun = () => {
    setRunWarning(null);
    setRan(false);
    setEvaluation(null);
    setReceipt(null);
    setReceiptError(null);
    retireWorkbenchRisk(riskRefs);
    setAcceptedRisk(null);
    setRiskRun((run) => run + 1);
  };

  const generateReceipt = async () => {
    if (!evaluation) return;
    try {
      const nextReceipt = await createReceipt(
        plumbReceiptInput(
          evaluation,
          { authorities, assertions },
          activePlumbPolicies.map((policy) => ({ id: policy.id, version: policy.version })),
        ),
      );
      setReceipt(nextReceipt);
      setReceiptError(null);
      downloadReceipt(nextReceipt);
      recordReceipt({
        id: nextReceipt.id,
        module: nextReceipt.module,
        verdict: nextReceipt.verdict,
        createdAt: nextReceipt.createdAt,
      });
    } catch {
      setReceipt(null);
      setReceiptError("A valid receipt could not be produced for this run.");
    }
  };

  const driftFindings =
    evaluation?.findings.filter((finding) => finding.status === "drifted") ?? [];
  // Each contradicting sentence cites the authority it actually conflicts with, rather
  // than borrowing the locator of whichever drift happened to be found first.
  const driftByAssertionLocator = new Map(
    driftFindings.map((finding) => [finding.assertion.reference.locator, finding]),
  );
  // Highlighting keys off the source locator a finding already carries, so it works the
  // same for a connected pull request as for the built-in sample.
  const driftedCodeLocators = new Set(
    driftFindings.map((finding) => finding.authority?.reference.locator),
  );

  const displayedDiffLines: DiffLine[] =
    parsedDiff?.lines ??
    (showsSampleCode ? (driftMode === "drift" ? DRIFT_DIFF_LINES : CLEAN_DIFF_LINES) : []);
  const additions = displayedDiffLines.filter((line) => line.kind === "add").length;
  const deletions = displayedDiffLines.filter((line) => line.kind === "del").length;
  const diffPath = parsedDiff?.path ?? (showsSampleCode ? "payments.ts" : "No change connected");
  const diffLabel = !connectedRepository
    ? showsSampleCode
      ? "sample PR #2431"
      : "connect a pull request or paste a diff above"
    : connectedRepository.owner && connectedRepository.repo
      ? `${connectedRepository.owner}/${connectedRepository.repo}${
          connectedRepository.pullNumber ? ` · PR #${connectedRepository.pullNumber}` : ""
        }`
      : "pasted diff";

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Plumb"
        icon={<GitPullRequest className="h-6 w-6" aria-hidden />}
        title="Docs vs. code"
        description="When your code changes but the docs, marketing decks, or filings don't, Plumb flags the mismatch — with the exact line — before the pull request is merged."
        actions={
          <>
            {showsSampleCode && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                <Switch
                  id="pr-toggle"
                  checked={driftMode === "drift"}
                  onCheckedChange={(checked) => {
                    setDriftMode(checked ? "drift" : "clean");
                    resetRun();
                  }}
                />
                <label htmlFor="pr-toggle" className="text-sm">
                  Simulate a risky pull request
                </label>
              </div>
            )}
            <Button onClick={runJudge} disabled={killSwitch}>
              {killSwitch ? (
                <>
                  <Lock className="h-4 w-4 mr-2" /> Blocked
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Check for contradictions
                </>
              )}
            </Button>
          </>
        }
      />

      {runWarning && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[color:var(--revise)]/40 bg-[color:var(--revise)]/[0.06] px-4 py-3 text-sm"
        >
          <AlertOctagon
            className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--revise)]"
            aria-hidden
          />
          <span>{runWarning}</span>
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> Applied policies
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activePlumbPolicies.length ? (
                activePlumbPolicies.map((policy) => (
                  <Badge key={policy.id} variant="outline">
                    {policy.shortName} · {policy.version}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline" className="text-[color:var(--revise)]">
                  No evaluation policy active
                </Badge>
              )}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/rulebooks">Manage policies</Link>
          </Button>
        </CardContent>
      </Card>

      <PlumbSources
        repository={connectedRepository}
        onRepositoryChange={(next) => {
          setConnectedRepository(next);
          resetRun();
        }}
        documents={sourceDocuments}
        onDocumentAdd={(document) => {
          // A real document replaces the sample set rather than sitting beside it.
          if (document.kind !== "sample") {
            for (const sample of sourceDocuments) {
              if (sample.kind === "sample") removeSourceDocument(sample.id);
            }
          }
          addSourceDocument(document);
          setDoc(document.id);
          resetRun();
        }}
        onDocumentRemove={(id) => {
          removeSourceDocument(id);
          if (doc === id) setDoc("");
          resetRun();
        }}
        policies={activePlumbPolicies}
        parsedDiff={parsedDiff}
        registerUploadTrigger={registerUploadTrigger}
      />

      <DriftRiskPanel
        risk={risk}
        hasConnectedChange={Boolean(connectedChange)}
        showsSampleCode={showsSampleCode}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="font-mono">
                {diffPath} <span className="text-muted-foreground">· {diffLabel}</span>
              </span>
              <Badge variant="outline">
                +{additions} −{deletions}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre
              className="text-xs font-mono overflow-x-auto"
              aria-label={`Git diff of ${diffPath}`}
            >
              {displayedDiffLines.length === 0 && (
                <div className="px-4 py-6 font-sans text-sm text-muted-foreground whitespace-normal">
                  No code change yet. Connect a pull request or paste a diff above, and Plumb
                  compares your documents against it.
                </div>
              )}
              {displayedDiffLines.map((l, index) => {
                const hit = ran && l.kind === "add" && driftedCodeLocators.has(`line ${l.n}`);
                const bg = l.kind === "add" ? "diff-add" : l.kind === "del" ? "diff-del" : "";
                const flag = hit ? "outline outline-2 outline-[color:var(--block)]" : "";
                return (
                  <div
                    key={`${l.kind}-${l.n}-${index}`}
                    className={`flex items-start ${bg} ${flag}`}
                  >
                    <span className="w-10 text-right pr-2 text-muted-foreground/60 select-none border-r border-border/40 py-0.5">
                      {l.n}
                    </span>
                    <span className="w-6 text-center text-muted-foreground/70 select-none py-0.5">
                      {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
                    </span>
                    <span className="flex-1 py-0.5 pr-2">{l.text}</span>
                    {hit && (
                      <span className="pr-3 py-0.5 text-[10px] font-mono text-[color:var(--block)]">
                        ◀ DRIFT
                      </span>
                    )}
                  </div>
                );
              })}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">What the docs still say</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceDocuments.length === 0 ? (
              <div className="space-y-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No documents yet. Upload the filings, decks, and policies that make claims about
                  this code, and each one becomes a tab here.
                </p>
                <div className="flex flex-col items-center gap-2">
                  <Button size="sm" onClick={() => openDocumentPicker.current?.()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Upload documents
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2"
                    onClick={loadSampleDocuments}
                  >
                    or try it with sample documents
                  </button>
                </div>
              </div>
            ) : (
              <Tabs
                value={selectedDoc?.id ?? ""}
                onValueChange={(value) => {
                  setDoc(value);
                  resetRun();
                }}
              >
                <TabsList className="flex w-full flex-wrap">
                  {sourceDocuments.map((document) => (
                    <TabsTrigger
                      key={document.id}
                      value={document.id}
                      className="flex-1 truncate"
                      title={document.name}
                    >
                      {document.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {sourceDocuments.map((document) => (
                  <TabsContent key={document.id} value={document.id} className="mt-3 space-y-2">
                    <div className="text-xs text-muted-foreground font-mono">
                      {document.name} · scanned under all {activePlumbPolicies.length} active{" "}
                      {activePlumbPolicies.length === 1 ? "policy" : "policies"}
                    </div>
                    {selectedSentences.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No readable text was extracted from this document.
                      </p>
                    )}
                    {selectedSentences.slice(0, 40).map((sentence) => (
                      <DocumentSentenceLine
                        key={sentence.id}
                        text={sentence.text}
                        locator={
                          ran
                            ? driftByAssertionLocator.get(sentence.id)?.authority?.reference.locator
                            : undefined
                        }
                      />
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>Audit report</span>
            <Button size="sm" variant="outline" onClick={generateReceipt} disabled={!evaluation}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Download receipt
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!ran && (
            <p className="text-sm text-muted-foreground">
              Click <span className="text-foreground">Check for contradictions</span>. Plumb will
              compare the selected document assertions with structured facts from the code change.
              The active model remains available for a later semantic-adapter stage.
            </p>
          )}
          {ran && evaluation && (
            <div className="flex flex-wrap items-start gap-6" aria-live="polite">
              {evaluation.verdict === "block" ? (
                <>
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="h-6 w-6 text-[color:var(--block)]" aria-hidden />
                    <div>
                      <div className="font-semibold text-[color:var(--block)]">
                        {evaluation.counts.drifted === 1
                          ? "Contradiction found"
                          : `${evaluation.counts.drifted} contradictions found`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Merge blocked — author needs to explain or update the docs
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Engine</dt>
                      <dd className="font-mono">Structured comparator</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Result</dt>
                      <dd className="font-mono">DRIFTED</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Rule</dt>
                      <dd className="font-mono text-primary">plumb.source-drift</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Where</dt>
                      <dd className="font-mono space-y-0.5">
                        {driftFindings.map((finding) => (
                          <div key={finding.id}>
                            {finding.authority?.reference.locator} ↔{" "}
                            {finding.assertion.reference.locator}
                          </div>
                        ))}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : evaluation.verdict === "revise" ? (
                <>
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-6 w-6 text-[color:var(--revise)]" aria-hidden />
                    <div>
                      <div className="font-semibold text-[color:var(--revise)]">
                        {evaluation.counts.cannot_determine > 0
                          ? "Cannot determine"
                          : "Review required"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {evaluation.counts.cannot_determine > 0
                          ? "A compatible authoritative source was not supplied for this assertion"
                          : "No evaluation policy is active, so this run is not covered by a policy pack"}
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {evaluation.counts.cannot_determine > 0 ? "Unresolved" : "Policies"}
                      </dt>
                      <dd className="font-mono">
                        {evaluation.counts.cannot_determine > 0
                          ? evaluation.counts.cannot_determine
                          : evaluation.policyIds.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Action</dt>
                      <dd className="font-mono">
                        {evaluation.counts.cannot_determine > 0
                          ? "Add source or review"
                          : "Activate a policy pack"}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-[color:var(--allow)]" aria-hidden />
                    <div>
                      <div className="font-semibold text-[color:var(--allow)]">
                        No contradiction
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Safe to merge — no contradiction found
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Engine</dt>
                      <dd className="font-mono">Structured comparator</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Matches</dt>
                      <dd className="font-mono">{evaluation.counts.matches}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Drift</dt>
                      <dd className="font-mono">0</dd>
                    </div>
                  </dl>
                </>
              )}
              <div className="basis-full overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm" aria-label="Plumb comparison summary">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium">
                        Claim checked
                      </th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">
                        Result
                      </th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">
                        Document says
                      </th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">
                        Code says
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluation.findings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                          No claim in this document matched a subject Plumb knows how to compare.
                        </td>
                      </tr>
                    ) : (
                      evaluation.findings.map((finding) => {
                        const status = STATUS_COPY[finding.status];
                        return (
                          <tr key={finding.id} className="border-t border-border/60">
                            <td className="px-4 py-2">
                              {SUBJECT_LABEL.get(finding.subject) ?? finding.subject}
                            </td>
                            <td className={`px-4 py-2 font-medium ${status.tone}`}>
                              {status.label}
                            </td>
                            <td className="px-4 py-2">
                              <ClaimCell claim={finding.assertion} />
                            </td>
                            <td className="px-4 py-2">
                              <ClaimCell claim={finding.authority} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="basis-full text-xs text-muted-foreground">
                Receipt scope: {evaluation.policyIds.length}{" "}
                {evaluation.policyIds.length === 1 ? "policy" : "policies"} applied.
              </div>
              <ReceiptSummary receipt={receipt} error={receiptError} className="basis-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
