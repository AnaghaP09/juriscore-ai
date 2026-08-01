import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import { compareClaims, type PlumbClaim, type PlumbResult } from "@/lib/juriscore/plumb/engine";
import { policiesForFeature } from "@/lib/juriscore/policies/catalog";
import { createReceipt, downloadReceipt } from "@/lib/juriscore/core/receipts";
import { plumbReceiptInput } from "@/lib/juriscore/plumb/receipt";
import type { ValidationReceipt } from "@/lib/juriscore/core/contracts";
import { ReceiptSummary } from "@/components/receipt-summary";

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

const DIFF_LINES: Array<{ n: number; kind: "add" | "del" | "ctx"; text: string; claim?: string }> =
  [
    { n: 40, kind: "ctx", text: "export const payments = {" },
    { n: 41, kind: "del", text: "  kycThreshold: 10_000," },
    { n: 42, kind: "add", text: "  kycThreshold: 25_000,", claim: "kyc" },
    { n: 43, kind: "ctx", text: '  currency: "USD",' },
    { n: 44, kind: "del", text: "  crossBorderFeeBps: 100, // 1.0%" },
    { n: 45, kind: "add", text: "  crossBorderFeeBps: 250, // 2.5%", claim: "fee" },
    { n: 46, kind: "ctx", text: "};" },
  ];

interface Sentence {
  id: string;
  text: string;
  claim?: string;
}
interface Doc {
  label: string;
  sentences: Sentence[];
}

const DOCS: Record<"sec" | "deck" | "policy", Doc> = {
  sec: {
    label: "SEC 10-K excerpt",
    sentences: [
      {
        id: "s1",
        text: "Our Know-Your-Customer program applies enhanced due diligence to any single transaction exceeding $10,000, consistent with BSA/AML expectations.",
        claim: "kyc",
      },
      {
        id: "s2",
        text: "Cross-border remittance fees disclosed to retail customers remain capped at 1.0% of principal for the reporting period.",
        claim: "fee",
      },
      {
        id: "s3",
        text: "The Company maintains independent oversight of all pricing changes through the Fee Review Committee.",
      },
    ],
  },
  deck: {
    label: "Customer sales deck · slide 12",
    sentences: [
      {
        id: "d1",
        text: "Send money across 40 markets with a flat 1% cross-border fee — the lowest transparent rate in the segment.",
        claim: "fee",
      },
      {
        id: "d2",
        text: "KYC verification runs automatically for any transaction over $10K.",
        claim: "kyc",
      },
    ],
  },
  policy: {
    label: "Internal policy · pricing-v3.pdf",
    sentences: [
      { id: "p1", text: "Fee schedule changes require CFO sign-off and a 30-day customer notice." },
      {
        id: "p2",
        text: "KYC monetary thresholds are governed centrally and cannot be adjusted at the product layer.",
        claim: "kyc",
      },
    ],
  },
};

type DocKey = keyof typeof DOCS;

const sourceReference = (sourceId: string, locator: string) => ({
  sourceId,
  sourceVersion: "synthetic-pr-2431",
  locator,
});

const DOCUMENT_CLAIMS: Record<DocKey, PlumbClaim[]> = {
  sec: [
    {
      id: "sec-kyc",
      subject: "kyc_threshold",
      value: 10_000,
      unit: "USD",
      statement: DOCS.sec.sentences[0].text,
      reference: sourceReference("sec-10k-excerpt", "s1"),
    },
    {
      id: "sec-fee",
      subject: "cross_border_fee",
      value: 1,
      unit: "percent",
      statement: DOCS.sec.sentences[1].text,
      reference: sourceReference("sec-10k-excerpt", "s2"),
    },
  ],
  deck: [
    {
      id: "deck-fee",
      subject: "cross_border_fee",
      value: 1,
      unit: "percent",
      statement: DOCS.deck.sentences[0].text,
      reference: sourceReference("sales-deck-v12", "d1"),
    },
    {
      id: "deck-kyc",
      subject: "kyc_threshold",
      value: 10_000,
      unit: "USD",
      statement: DOCS.deck.sentences[1].text,
      reference: sourceReference("sales-deck-v12", "d2"),
    },
  ],
  policy: [
    {
      id: "policy-governance",
      subject: "kyc_governance",
      value: "central_only",
      statement: DOCS.policy.sentences[1].text,
      reference: sourceReference("pricing-v3.pdf", "p2"),
    },
  ],
};

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

function DriftView() {
  const {
    driftMode,
    setDriftMode,
    killSwitch,
    activePolicyIds,
    customPolicies,
    recordSessionCheck,
    recordSessionReceipt,
  } = useDemoStore();
  const [doc, setDoc] = useState<DocKey>("sec");
  const [ran, setRan] = useState(false);
  const [highlightClaim, setHighlightClaim] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<PlumbResult | null>(null);
  const [receipt, setReceipt] = useState<ValidationReceipt | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const activePlumbPolicies = useMemo(
    () => policiesForFeature(activePolicyIds, "plumb", customPolicies),
    [activePolicyIds, customPolicies],
  );

  const runJudge = () => {
    if (killSwitch) return;
    setReceipt(null);
    setReceiptError(null);
    const nextEvaluation = compareClaims(codeClaims(driftMode), DOCUMENT_CLAIMS[doc], {
      policyIds: activePlumbPolicies.map((policy) => policy.id),
    });
    const driftFinding = nextEvaluation.findings.find((finding) => finding.status === "drifted");
    setRan(true);
    setEvaluation(nextEvaluation);
    recordSessionCheck("plumb", nextEvaluation.verdict);
    setHighlightClaim(
      driftFinding?.subject === "cross_border_fee"
        ? "fee"
        : driftFinding?.subject === "kyc_threshold"
          ? "kyc"
          : null,
    );
  };

  const generateReceipt = async () => {
    if (!evaluation) return;
    try {
      const nextReceipt = await createReceipt(
        plumbReceiptInput(
          evaluation,
          { authorities: codeClaims(driftMode), assertions: DOCUMENT_CLAIMS[doc] },
          activePlumbPolicies.map((policy) => ({ id: policy.id, version: policy.version })),
        ),
      );
      setReceipt(nextReceipt);
      setReceiptError(null);
      downloadReceipt(nextReceipt);
      recordSessionReceipt({
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

  const primaryDrift = evaluation?.findings.find((finding) => finding.status === "drifted");
  const displayedDiffLines = DIFF_LINES.map((line) => {
    if (driftMode === "drift") return line;
    if (line.n === 42) return { ...line, text: "  kycThreshold: 10_000, // normalized" };
    if (line.n === 45) return { ...line, text: "  crossBorderFeeBps: 100, // 1.0%" };
    return line;
  });

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Plumb"
        icon={<GitPullRequest className="h-6 w-6" aria-hidden />}
        title="Docs vs. code"
        description="When your code changes but the docs, marketing decks, or filings don't, Plumb flags the mismatch — with the exact line — before the pull request is merged."
        actions={
          <>
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              <Switch
                id="pr-toggle"
                checked={driftMode === "drift"}
                onCheckedChange={(checked) => {
                  setDriftMode(checked ? "drift" : "clean");
                  setRan(false);
                  setEvaluation(null);
                  setHighlightClaim(null);
                  setReceipt(null);
                  setReceiptError(null);
                }}
              />
              <label htmlFor="pr-toggle" className="text-sm">
                Simulate a risky pull request
              </label>
            </div>
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

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="font-mono">
                payments.ts <span className="text-muted-foreground">· PR #2431</span>
              </span>
              <Badge variant="outline">+2 −2</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="text-xs font-mono overflow-x-auto" aria-label="Git diff of payments.ts">
              {displayedDiffLines.map((l) => {
                const hit = ran && highlightClaim && l.claim === highlightClaim;
                const bg = l.kind === "add" ? "diff-add" : l.kind === "del" ? "diff-del" : "";
                const flag = hit ? "outline outline-2 outline-[color:var(--block)]" : "";
                return (
                  <div key={l.n} className={`flex items-start ${bg} ${flag}`}>
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
            <Tabs
              value={doc}
              onValueChange={(value) => {
                setDoc(value as DocKey);
                setRan(false);
                setEvaluation(null);
                setHighlightClaim(null);
                setReceipt(null);
                setReceiptError(null);
              }}
            >
              <TabsList className="grid grid-cols-3 w-full">
                {(Object.keys(DOCS) as DocKey[]).map((k) => (
                  <TabsTrigger key={k} value={k}>
                    {DOCS[k].label.split("·")[0].trim()}
                  </TabsTrigger>
                ))}
              </TabsList>
              {(Object.keys(DOCS) as DocKey[]).map((k) => (
                <TabsContent key={k} value={k} className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground font-mono">{DOCS[k].label}</div>
                  {DOCS[k].sentences.map((s) => {
                    const hit = ran && highlightClaim && s.claim === highlightClaim;
                    return (
                      <p
                        key={s.id}
                        className={`text-sm leading-relaxed p-2 rounded-md border transition-colors ${
                          hit
                            ? "border-[color:var(--block)]/60 bg-[color:var(--block)]/10 text-foreground"
                            : "border-transparent text-muted-foreground"
                        }`}
                      >
                        {hit && (
                          <span className="inline-block mr-2 text-[10px] font-mono text-[color:var(--block)] uppercase">
                            Contradicts +{primaryDrift?.authority?.reference.locator ?? "source"}
                          </span>
                        )}
                        {s.text}
                      </p>
                    );
                  })}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>Verdict</span>
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
                        Contradiction found
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
                      <dd className="font-mono">
                        {primaryDrift?.authority?.reference.locator} ↔{" "}
                        {primaryDrift?.assertion.reference.locator}
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
                        Cannot determine
                      </div>
                      <div className="text-xs text-muted-foreground">
                        A compatible authoritative source was not supplied for this assertion
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Unresolved</dt>
                      <dd className="font-mono">{evaluation.counts.cannot_determine}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Action</dt>
                      <dd className="font-mono">Add source or review</dd>
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
