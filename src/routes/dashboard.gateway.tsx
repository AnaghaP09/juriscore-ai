import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { MODELS, modelById, useDemoStore, type ModelId } from "@/lib/juriscore/demo-store";
import { scanPrompt, retrievePolicies } from "@/lib/juriscore/mock";
import { Send, Cpu, Timer, ShieldCheck, Lock, Zap, Info, ShieldAlert, BookOpen, ScrollText } from "lucide-react";

export const Route = createFileRoute("/dashboard/gateway")({
  head: () => ({
    meta: [
      { title: "LLM Gateway — JurisCore AI" },
      { name: "description", content: "Send a live prompt through the JurisCore compliance layer." },
    ],
  }),
  component: Gateway,
});

type Stage = "input" | "model" | "judge" | "output";
const STAGE_LABELS: Record<Stage, string> = {
  input: "Input Scrub",
  model: "Model Call",
  judge: "Semantic Judge",
  output: "Output Guardrail",
};

interface RunResult {
  verdict: "allow" | "block" | "revise";
  ruleId?: string;
  blockedAt?: Stage;
  reason?: string;
  tokens: { prompt: number; completion: number };
  latencyBreakdown: Record<Stage, number>;
  totalLatency: number;
  citations: string[];
}

function Gateway() {
  const { activeModel, setActiveModel, killSwitch, pushRun, recentRuns } = useDemoStore();
  const [prompt, setPrompt] = useState("Draft a client email highlighting our fund's 3-year outperformance vs benchmark.");
  const [domain, setDomain] = useState<"finance" | "healthcare">("finance");
  const [running, setRunning] = useState<Stage | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);

  const run = async () => {
    if (killSwitch || !prompt.trim()) return;
    setResult(null);
    setProgress(0);
    const stages: Stage[] = ["input", "model", "judge", "output"];
    const scan = scanPrompt(prompt, domain);
    const policies = retrievePolicies(prompt, domain, 2);
    const modelLatency = activeModel === "gemini-1.5-pro" ? 320 : activeModel === "claude-3.5-sonnet" ? 410 : 380;
    const breakdown: Record<Stage, number> = { input: 45 + Math.random() * 30, model: modelLatency + Math.random() * 120, judge: 80 + Math.random() * 40, output: 60 + Math.random() * 30 };

    let blockedAt: Stage | undefined;
    let verdict: RunResult["verdict"] = "allow";
    let ruleId: string | undefined;
    let reason: string | undefined;

    if (scan.verdict === "block") {
      blockedAt = "input";
      verdict = "block";
      reason = scan.findings.map((f) => f.type).join(", ");
      ruleId = domain === "finance" ? "SEC-T42" : "HIPAA-164.502";
    } else if (Math.random() < 0.15) {
      blockedAt = "judge";
      verdict = "revise";
      reason = "Semantic mismatch: draft claim not backed by retrieved policy.";
      ruleId = policies[0]?.id;
    }

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      setRunning(s);
      await new Promise((r) => setTimeout(r, Math.min(breakdown[s], 900)));
      setProgress(((i + 1) / stages.length) * 100);
      if (blockedAt === s) break;
    }
    setRunning(null);

    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = verdict === "block" ? 0 : 180 + Math.floor(Math.random() * 240);
    const totalLatency = Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0));

    const res: RunResult = {
      verdict,
      ruleId,
      blockedAt,
      reason,
      tokens: { prompt: promptTokens, completion: completionTokens },
      latencyBreakdown: breakdown,
      totalLatency,
      citations: policies.map((p) => p.id),
    };
    setResult(res);
    pushRun({
      id: `rt_${Date.now().toString(36)}`,
      ts: new Date().toISOString(),
      model: activeModel,
      prompt,
      verdict,
      tokens: res.tokens,
      latencyMs: totalLatency,
      ruleId,
      stage: blockedAt,
    });
  };

  const active = modelById(activeModel);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Try it live"
        icon={<Zap className="h-6 w-6" aria-hidden />}
        title="Send a question through JurisCore"
        description="Type anything, pick an AI, and watch each check happen. Same setup works with any model — no code change on your side."
        actions={
          <>
            <label htmlFor="gw-model" className="sr-only">Which AI to use</label>
            <Select value={activeModel} onValueChange={(v) => setActiveModel(v as ModelId)}>
              <SelectTrigger id="gw-model" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: m.accent }} aria-hidden />
                      {m.label} <span className="text-xs text-muted-foreground">· {m.vendor}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" aria-hidden /> What this demo shows
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p>
            This is a live walk-through of how JurisCore sits between your app and any AI model.
            Type a question, pick a model, and hit <span className="font-medium text-foreground">Send through JurisCore</span>.
            The same request is checked four times — you'll see each check light up in order.
          </p>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            <li className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs"><ShieldAlert className="h-3.5 w-3.5 text-primary" aria-hidden /> 1. Input Scrub</div>
              <p className="mt-1 text-xs">Scans your question for private data (names, SSNs, medical IDs, API keys) and prompt-injection tricks. Blocks or masks before anything is sent to the AI.</p>
            </li>
            <li className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs"><Cpu className="h-3.5 w-3.5 text-primary" aria-hidden /> 2. Model Call</div>
              <p className="mt-1 text-xs">Sends the clean question to the model you picked — Gemini, Claude, or GPT-4o. You'd swap models with one dropdown, not a rewrite.</p>
            </li>
            <li className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs"><BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden /> 3. Semantic Judge</div>
              <p className="mt-1 text-xs">Pulls the matching clause from your rulebook (SEC, FINRA, HIPAA, CMS) and checks whether the reply actually agrees with it. If not, it's marked for revision.</p>
            </li>
            <li className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs"><ScrollText className="h-3.5 w-3.5 text-primary" aria-hidden /> 4. Output Guardrail</div>
              <p className="mt-1 text-xs">Final pass — attaches citations, flags uncited claims, and writes a tamper-proof audit entry so any regulator can retrace the decision.</p>
            </li>
          </ol>
          <p className="text-xs pt-1">
            The result cards below show the <span className="font-medium text-foreground">verdict</span> (allow / revise / block),
            which <span className="font-medium text-foreground">rule</span> was triggered, token usage and per-stage latency.
            Try a clean marketing question versus one with an SSN or a medical record ID — you'll see the verdict change.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Your test question</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Sending to <span className="font-mono text-foreground">{active.label}</span> · {active.ctx} · {active.costPer1K}/1K tokens
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="gw-domain" className="sr-only">Regulated domain</label>
            <Select value={domain} onValueChange={(v) => setDomain(v as typeof domain)}>
              <SelectTrigger id="gw-domain" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="healthcare">Healthcare</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label htmlFor="gw-prompt" className="sr-only">Prompt</label>
          <Textarea id="gw-prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="font-mono text-sm" />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={!!running || killSwitch}>
              {killSwitch ? (<><Lock className="h-4 w-4 mr-2" /> Emergency stop is on</>) : (<><Send className="h-4 w-4 mr-2" /> Send through JurisCore</>)}
            </Button>
            <div className="flex-1 min-w-[16rem]">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                {(["input", "model", "judge", "output"] as Stage[]).map((s) => (
                  <span key={s} className={running === s ? "text-primary" : ""}>{STAGE_LABELS[s]}</span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="grid lg:grid-cols-3 gap-4" aria-live="polite">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> Tokens</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 font-mono text-sm">
                <div><div className="text-xs text-muted-foreground">Prompt</div><div className="text-lg">{result.tokens.prompt}</div></div>
                <div><div className="text-xs text-muted-foreground">Completion</div><div className="text-lg">{result.tokens.completion}</div></div>
                <div><div className="text-xs text-muted-foreground">Total</div><div className="text-lg text-primary">{result.tokens.prompt + result.tokens.completion}</div></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Timer className="h-4 w-4 text-primary" /> Latency · {result.totalLatency}ms</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(["input", "model", "judge", "output"] as Stage[]).map((s) => {
                const pct = (result.latencyBreakdown[s] / result.totalLatency) * 100;
                return (
                  <div key={s}>
                    <div className="flex justify-between text-xs text-muted-foreground font-mono">
                      <span>{STAGE_LABELS[s]}</span>
                      <span>{Math.round(result.latencyBreakdown[s])}ms</span>
                    </div>
                    <div className="h-1.5 mt-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Verdict</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={
                  result.verdict === "allow" ? "border-[color:var(--allow)]/40 text-[color:var(--allow)]" :
                  result.verdict === "block" ? "border-[color:var(--block)]/40 text-[color:var(--block)]" :
                  "border-[color:var(--revise)]/40 text-[color:var(--revise)]"
                }>{result.verdict.toUpperCase()}</Badge>
                {result.ruleId && <span className="font-mono text-xs text-muted-foreground">{result.ruleId}</span>}
              </div>
              {result.reason && <p className="text-xs text-muted-foreground">{result.reason}</p>}
              {result.citations.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Citations attached:</div>
                  <div className="flex flex-wrap gap-1">
                    {result.citations.map((c) => <Badge key={c} variant="secondary" className="font-mono text-[10px]">{c}</Badge>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {recentRuns.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Recent runs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {recentRuns.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/40 text-xs font-mono">
                  <span className="text-muted-foreground">{r.ts.slice(11, 19)}</span>
                  <span className="w-32 truncate">{modelById(r.model).label}</span>
                  <Badge variant="outline" className={`text-[10px] ${
                    r.verdict === "allow" ? "border-[color:var(--allow)]/40 text-[color:var(--allow)]" :
                    r.verdict === "block" ? "border-[color:var(--block)]/40 text-[color:var(--block)]" :
                    "border-[color:var(--revise)]/40 text-[color:var(--revise)]"
                  }`}>{r.verdict}</Badge>
                  <span className="text-muted-foreground">{r.latencyMs}ms</span>
                  <span className="flex-1 truncate text-muted-foreground/80">{r.prompt}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
