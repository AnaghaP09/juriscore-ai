import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, GitPullRequest, Lock, AlertOctagon, CheckCircle2 } from "lucide-react";
import { modelById, useDemoStore } from "@/lib/juriscore/demo-store";

export const Route = createFileRoute("/dashboard/drift")({
  head: () => ({
    meta: [
      { title: "Drift Workbench — JurisCore AI" },
      { name: "description", content: "Detect PR-vs-prose contradictions using an LLM semantic judge." },
    ],
  }),
  component: DriftView,
});

const DIFF_LINES: Array<{ n: number; kind: "add" | "del" | "ctx"; text: string; claim?: string }> = [
  { n: 40, kind: "ctx", text: "export const payments = {" },
  { n: 41, kind: "del", text: "  kycThreshold: 10_000," },
  { n: 42, kind: "add", text: "  kycThreshold: 25_000,", claim: "kyc" },
  { n: 43, kind: "ctx", text: "  currency: \"USD\"," },
  { n: 44, kind: "del", text: "  crossBorderFeeBps: 100, // 1.0%" },
  { n: 45, kind: "add", text: "  crossBorderFeeBps: 250, // 2.5%", claim: "fee" },
  { n: 46, kind: "ctx", text: "};" },
];

const DOCS = {
  sec: {
    label: "SEC 10-K excerpt",
    sentences: [
      { id: "s1", text: "Our Know-Your-Customer program applies enhanced due diligence to any single transaction exceeding $10,000, consistent with BSA/AML expectations." , claim: "kyc" },
      { id: "s2", text: "Cross-border remittance fees disclosed to retail customers remain capped at 1.0% of principal for the reporting period." , claim: "fee" },
      { id: "s3", text: "The Company maintains independent oversight of all pricing changes through the Fee Review Committee." },
    ],
  },
  deck: {
    label: "Customer sales deck · slide 12",
    sentences: [
      { id: "d1", text: "Send money across 40 markets with a flat 1% cross-border fee — the lowest transparent rate in the segment.", claim: "fee" },
      { id: "d2", text: "KYC verification runs automatically for any transaction over $10K." , claim: "kyc" },
    ],
  },
  policy: {
    label: "Internal policy · pricing-v3.pdf",
    sentences: [
      { id: "p1", text: "Fee schedule changes require CFO sign-off and a 30-day customer notice." },
      { id: "p2", text: "KYC monetary thresholds are governed centrally and cannot be adjusted at the product layer." , claim: "kyc" },
    ],
  },
} as const;

type DocKey = keyof typeof DOCS;

function DriftView() {
  const { driftMode, setDriftMode, activeModel, killSwitch } = useDemoStore();
  const [doc, setDoc] = useState<DocKey>("sec");
  const [judging, setJudging] = useState(false);
  const [ran, setRan] = useState(false);
  const [highlightClaim, setHighlightClaim] = useState<string | null>(null);

  const runJudge = async () => {
    if (killSwitch) return;
    setRan(false);
    setJudging(true);
    setHighlightClaim(null);
    await new Promise((r) => setTimeout(r, 1400));
    setJudging(false);
    setRan(true);
    setHighlightClaim(driftMode === "drift" ? "fee" : null);
  };

  const model = modelById(activeModel);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <GitPullRequest className="h-6 w-6 text-primary" aria-hidden /> Drift Workbench
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            The Plumb wedge: an LLM judge that flags when a code change contradicts what the company already told regulators or customers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <Switch id="pr-toggle" checked={driftMode === "drift"} onCheckedChange={(c) => { setDriftMode(c ? "drift" : "clean"); setRan(false); }} />
            <label htmlFor="pr-toggle" className="text-sm">Simulate New PR Review</label>
          </div>
          <Button onClick={runJudge} disabled={judging || killSwitch}>
            {killSwitch ? (<><Lock className="h-4 w-4 mr-2" /> Blocked</>) : (<><Sparkles className="h-4 w-4 mr-2" /> {judging ? "Judging…" : "Run Plumb Judge"}</>)}
          </Button>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="font-mono">payments.ts <span className="text-muted-foreground">· PR #2431</span></span>
              <Badge variant="outline">+2 −2</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="text-xs font-mono overflow-x-auto" aria-label="Git diff of payments.ts">
              {DIFF_LINES.map((l) => {
                const hit = ran && highlightClaim && l.claim === highlightClaim;
                const bg = l.kind === "add" ? "diff-add" : l.kind === "del" ? "diff-del" : "";
                const flag = hit ? "outline outline-2 outline-[color:var(--block)]" : "";
                return (
                  <div key={l.n} className={`flex items-start ${bg} ${flag}`}>
                    <span className="w-10 text-right pr-2 text-muted-foreground/60 select-none border-r border-border/40 py-0.5">{l.n}</span>
                    <span className="w-6 text-center text-muted-foreground/70 select-none py-0.5">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                    <span className="flex-1 py-0.5 pr-2">{l.text}</span>
                    {hit && <span className="pr-3 py-0.5 text-[10px] font-mono text-[color:var(--block)]">◀ DRIFT</span>}
                  </div>
                );
              })}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Compliance Corpus</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={doc} onValueChange={(v) => setDoc(v as DocKey)}>
              <TabsList className="grid grid-cols-3 w-full">
                {(Object.keys(DOCS) as DocKey[]).map((k) => (
                  <TabsTrigger key={k} value={k}>{DOCS[k].label.split("·")[0].trim()}</TabsTrigger>
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
                          hit ? "border-[color:var(--block)]/60 bg-[color:var(--block)]/10 text-foreground" : "border-transparent text-muted-foreground"
                        }`}
                      >
                        {hit && <span className="inline-block mr-2 text-[10px] font-mono text-[color:var(--block)] uppercase">Contradicts +line 45</span>}
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
        <CardHeader className="pb-3"><CardTitle className="text-sm">Judge verdict</CardTitle></CardHeader>
        <CardContent>
          {!ran && !judging && (
            <p className="text-sm text-muted-foreground">Click <span className="text-foreground">Run Plumb Judge</span> to ask {model.label} whether the PR contradicts any indexed document.</p>
          )}
          {judging && (
            <p className="text-sm text-muted-foreground" aria-live="polite">Asking {model.label} for a semantic verdict on the diff vs. {DOCS[doc].label}…</p>
          )}
          {ran && (
            <div className="flex flex-wrap items-start gap-6" aria-live="polite">
              {highlightClaim ? (
                <>
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="h-6 w-6 text-[color:var(--block)]" aria-hidden />
                    <div>
                      <div className="font-semibold text-[color:var(--block)]">DRIFTED</div>
                      <div className="text-xs text-muted-foreground">Merge blocked · author explanation required</div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Model</dt><dd className="font-mono">{model.label}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Confidence</dt><dd className="font-mono">94%</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Rule</dt><dd className="font-mono text-primary">SEC-206(4)-1</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Evidence</dt><dd className="font-mono">line 45 ↔ {doc === "sec" ? "s2" : doc === "deck" ? "d1" : "p1"}</dd></div>
                  </dl>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-[color:var(--allow)]" aria-hidden />
                    <div>
                      <div className="font-semibold text-[color:var(--allow)]">NO CONTRADICTION</div>
                      <div className="text-xs text-muted-foreground">Safe to merge · logged to ledger</div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Model</dt><dd className="font-mono">{model.label}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Confidence</dt><dd className="font-mono">88%</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Docs checked</dt><dd className="font-mono">3</dd></div>
                  </dl>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
