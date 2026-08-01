import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Play, Lock, Activity } from "lucide-react";
import { useDemoStore } from "@/lib/juriscore/demo-store";

export const Route = createFileRoute("/dashboard/pipeline")({
  head: () => ({
    meta: [
      { title: "Runtime Pipeline — JurisCore AI" },
      { name: "description", content: "Live view of the interception pipeline." },
    ],
  }),
  component: Pipeline,
});

type Scenario = "clean" | "pii" | "drift" | "uncited";
type State = "idle" | "active" | "pass" | "block" | "revise";

const STAGES = [
  { key: "req", label: "Question arrives", detail: "A user or app sends a prompt" },
  { key: "input", label: "Scrub the question", detail: "Remove private data · block sneaky prompts" },
  { key: "model", label: "Ask the AI", detail: "Send the clean prompt to your chosen model" },
  { key: "judge", label: "Cross-check the answer", detail: "Does what the AI said match your policies?" },
  { key: "output", label: "Require citations", detail: "Every claim must trace to a real rule" },
  { key: "ledger", label: "Issue the receipt", detail: "A receipt for every decision" },
] as const;

const SCENARIO_LABEL: Record<Scenario, string> = {
  clean: "Safe question — everything passes",
  pii: "Private data in the question — blocked",
  drift: "AI answer contradicts an SEC filing — blocked",
  uncited: "AI made claims with no source — rewritten",
};

const BLOCK_AT: Record<Scenario, { idx: number; state: State; reason: string; rule: string } | null> = {
  clean: null,
  pii: { idx: 1, state: "block", reason: "SSN detected in prompt", rule: "HIPAA-164.502 · SEC-T42" },
  drift: { idx: 3, state: "block", reason: "Draft contradicts SEC filing", rule: "SEC-206(4)-1" },
  uncited: { idx: 4, state: "revise", reason: "3 claims lack a cited source", rule: "FINRA-2210" },
};

const PAYLOADS: Record<Scenario, Record<number, { before: string; after: string }>> = {
  clean: {
    1: { before: `{ "prompt": "Summarize Q3 fund performance vs benchmark" }`, after: `{ "prompt": "Summarize Q3 fund performance vs benchmark", "scrub": [] }` },
    2: { before: `POST → gemini-1.5-pro`, after: `{ "completion": "Q3 outperformance was 3.2%…", "tokens": 214 }` },
    3: { before: `judge(completion, policies=[SEC-206(4)-1])`, after: `{ "mismatch": false, "confidence": 0.94 }` },
    4: { before: `enforce_citations(response)`, after: `{ "coverage": 0.92, "cited": ["SEC-206(4)-1","FINRA-2210"] }` },
    5: { before: `append_ledger(run)`, after: `{ "id": "jc_00817", "hash": "0xa1f…", "verdict": "allow" }` },
  },
  pii: {
    1: { before: `{ "prompt": "…client SSN 123-45-6789…" }`, after: `BLOCKED — PII detected, request rejected` },
    2: { before: "-", after: "-" },
    3: { before: "-", after: "-" },
    4: { before: "-", after: "-" },
    5: { before: "append_ledger(block)", after: `{ "id": "jc_00818", "verdict": "block", "rule": "SEC-T42" }` },
  },
  drift: {
    1: { before: `{ "prompt": "Draft PR summary for fee change" }`, after: `{ "prompt": "…", "scrub": [] }` },
    2: { before: `POST → claude-3.5-sonnet`, after: `{ "completion": "Cross-border fee remains 1%…", "tokens": 187 }` },
    3: { before: `judge(completion, git_diff, sec_filing)`, after: `BLOCKED — draft contradicts SEC filing (line 42)` },
    4: { before: "-", after: "-" },
    5: { before: "append_ledger(block)", after: `{ "id": "jc_00819", "verdict": "block", "rule": "SEC-206(4)-1" }` },
  },
  uncited: {
    1: { before: `{ "prompt": "Explain suitability for retiree" }`, after: `{ "prompt": "…", "scrub": [] }` },
    2: { before: `POST → gpt-4o`, after: `{ "completion": "This product must be considered…" }` },
    3: { before: `judge(completion)`, after: `{ "mismatch": false, "confidence": 0.88 }` },
    4: { before: `enforce_citations(response)`, after: `REVISE — 3 uncited "must/required" claims` },
    5: { before: "append_ledger(revise)", after: `{ "id": "jc_00820", "verdict": "revise", "rule": "FINRA-2210" }` },
  },
};

function Pipeline() {
  const { killSwitch, activeModel } = useDemoStore();
  const [scenario, setScenario] = useState<Scenario>("clean");
  const [states, setStates] = useState<State[]>(() => Array(STAGES.length).fill("idle"));
  const [focus, setFocus] = useState(0);
  const [running, setRunning] = useState(false);
  const [announce, setAnnounce] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const play = () => {
    if (killSwitch) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStates(Array(STAGES.length).fill("idle"));
    setRunning(true);
    setFocus(0);
    setAnnounce("Pipeline started");
    const blocker = BLOCK_AT[scenario];
    STAGES.forEach((s, i) => {
      const t1 = setTimeout(() => {
        setStates((prev) => { const n = [...prev]; n[i] = "active"; return n; });
        setFocus(i);
        setAnnounce(`Stage ${i + 1}: ${s.label} · processing`);
      }, i * 700);
      timers.current.push(t1);
      const t2 = setTimeout(() => {
        setStates((prev) => {
          const n = [...prev];
          if (blocker && blocker.idx === i) n[i] = blocker.state;
          else n[i] = "pass";
          return n;
        });
        if (blocker && blocker.idx === i) {
          setAnnounce(`Stage ${i + 1}: ${s.label} · ${blocker.state === "block" ? "blocked" : "revised"} — ${blocker.reason}`);
          setRunning(false);
        }
      }, i * 700 + 500);
      timers.current.push(t2);
      if (blocker && blocker.idx === i) return;
    });
    const total = STAGES.length * 700 + 500;
    timers.current.push(setTimeout(() => { setRunning(false); setAnnounce("Pipeline complete"); }, total));
  };

  const focused = STAGES[focus];
  const payload = PAYLOADS[scenario][focus] ?? { before: "-", after: "-" };
  const blocker = BLOCK_AT[scenario];

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="How it works"
        icon={<Activity className="h-6 w-6" aria-hidden />}
        title="Step by step"
        description="Pick a scenario and watch where JurisCore steps in. Six checks, from the moment a question arrives to the receipt issued at the end."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="pl-scenario" className="sr-only">Scenario</label>
            <Select value={scenario} onValueChange={(v) => { setScenario(v as Scenario); setStates(Array(STAGES.length).fill("idle")); }}>
              <SelectTrigger id="pl-scenario" className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SCENARIO_LABEL) as Scenario[]).map((k) => (
                  <SelectItem key={k} value={k}>{SCENARIO_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="font-mono">{activeModel}</Badge>
          </div>
          <Button onClick={play} disabled={running || killSwitch}>
            {killSwitch ? (<><Lock className="h-4 w-4 mr-2" /> Blocked</>) : (<><Play className="h-4 w-4 mr-2" /> {running ? "Running…" : "Play scenario"}</>)}
          </Button>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-1 md:grid-cols-6 gap-3" aria-label="Pipeline stages">
            {STAGES.map((s, i) => {
              const state = states[i];
              const color =
                state === "block" ? "border-[color:var(--block)] bg-[color:var(--block)]/10 text-[color:var(--block)]" :
                state === "revise" ? "border-[color:var(--revise)] bg-[color:var(--revise)]/10 text-[color:var(--revise)]" :
                state === "pass" ? "border-[color:var(--allow)]/60 bg-[color:var(--allow)]/10 text-[color:var(--allow)]" :
                state === "active" ? "border-primary bg-primary/10 text-primary pulse-ring" :
                "border-border bg-muted/20 text-muted-foreground";
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setFocus(i)}
                    aria-current={focus === i ? "step" : undefined}
                    className={`w-full text-left rounded-lg border-2 p-3 transition-all ${color} ${focus === i ? "ring-2 ring-ring/40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider opacity-70">Stage {i + 1}</span>
                      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
                    </div>
                    <div className="mt-2 font-semibold text-sm text-foreground">{s.label}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{s.detail}</div>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="sr-only" aria-live="polite">{announce}</div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Stage {focus + 1} · {focused.label}</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Input</div>
              <pre className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">{payload.before}</pre>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Output</div>
              <pre className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">{payload.after}</pre>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Scenario verdict</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!blocker ? (
              <>
                <Badge variant="outline" className="border-[color:var(--allow)]/40 text-[color:var(--allow)]">ALLOW</Badge>
                <p className="text-muted-foreground text-xs">All six stages passed. Ledger entry appended.</p>
              </>
            ) : (
              <>
                <Badge variant="outline" className={blocker.state === "block" ? "border-[color:var(--block)]/40 text-[color:var(--block)]" : "border-[color:var(--revise)]/40 text-[color:var(--revise)]"}>{blocker.state.toUpperCase()}</Badge>
                <p className="text-xs text-muted-foreground">Stopped at stage {blocker.idx + 1}: <span className="text-foreground">{STAGES[blocker.idx].label}</span></p>
                <p className="text-xs">{blocker.reason}</p>
                <div className="font-mono text-xs text-primary">{blocker.rule}</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
