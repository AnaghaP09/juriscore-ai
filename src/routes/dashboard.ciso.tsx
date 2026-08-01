import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { AlertTriangle, ShieldAlert, ShieldCheck, Database, Timer } from "lucide-react";
import { MODELS, useDemoStore } from "@/lib/juriscore/demo-store";
import { AUDIT, RULEBOOKS, getMetrics } from "@/lib/juriscore/mock";

export const Route = createFileRoute("/dashboard/ciso")({
  head: () => ({
    meta: [
      { title: "CISO Gateway — JurisCore AI" },
      { name: "description", content: "Executive telemetry and the universal kill switch." },
    ],
  }),
  component: Ciso,
});

const REGIONS = ["us-east-1", "eu-west-1", "ap-south-1"];

function Ciso() {
  const { killSwitch, setKillSwitch } = useDemoStore();
  const [confirming, setConfirming] = useState(false);
  const m = getMetrics();
  const precision = 0.892;
  const mismatches = AUDIT.filter((a) => a.verdict !== "allow").slice(0, 6);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Executive view"
        icon={<ShieldAlert className="h-6 w-6" aria-hidden />}
        title="Every AI app in one screen"
        description="One place to see how your AI is behaving across models, regions, and teams — plus the emergency stop when you need it."
        actions={
          <Button
            size="lg"
            variant={killSwitch ? "outline" : "destructive"}
            onClick={() => (killSwitch ? setKillSwitch(false) : setConfirming(true))}
            className="gap-2"
          >
            {killSwitch ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            {killSwitch ? "Turn AI back on" : "Emergency stop — freeze all AI"}
          </Button>
        }
      />

      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">How often we're right</div>
              <Badge variant="outline" className="text-[10px] text-[color:var(--revise)]">Demo data · synthetic</Badge>
            </div>
            <RadialDial value={precision} target={0.85} />
            <div className="mt-2 text-xs text-muted-foreground">Goal: at least 85% (checked by humans)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Rulebooks in use</div>
                <div className="mt-2 text-3xl font-semibold font-mono">{RULEBOOKS.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">{RULEBOOKS.reduce((s, r) => s + r.docCount, 0)} documents indexed</div>
              </div>
              <Database className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <Sparkline data={[3, 3, 4, 4, 4, 5, 5]} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Things we caught</div>
                <div className="mt-2 text-3xl font-semibold font-mono text-[color:var(--block)]">{mismatches.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">Still open · last 24 hours</div>
              </div>
              <AlertTriangle className="h-5 w-5 text-[color:var(--block)]" aria-hidden />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Time we add</div>
                <div className="mt-2 text-3xl font-semibold font-mono">{m.kpis.avgLatencyMs}<span className="text-base text-muted-foreground ml-1">ms</span></div>
                <div className="mt-1 text-xs text-muted-foreground">Well under the 800ms budget</div>
              </div>
              <Timer className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <Sparkline data={[520, 480, 510, 460, 500, m.kpis.avgLatencyMs, m.kpis.avgLatencyMs - 20]} />
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">AI health by region</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Model endpoint health matrix">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Model</th>
                  {REGIONS.map((r) => <th key={r} scope="col" className="text-left px-4 py-2 font-medium font-mono">{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODELS.map((mm, i) => (
                  <tr key={mm.id} className="border-t border-border/60">
                    <td className="px-4 py-2">{mm.label}</td>
                    {REGIONS.map((r, j) => {
                      const status = killSwitch ? "Blocked" : (i + j) % 5 === 3 ? "Degraded" : "Healthy";
                      const color = status === "Blocked" ? "border-[color:var(--block)]/40 text-[color:var(--block)]" : status === "Degraded" ? "border-[color:var(--revise)]/40 text-[color:var(--revise)]" : "border-[color:var(--allow)]/40 text-[color:var(--allow)]";
                      return <td key={r} className="px-4 py-2"><Badge variant="outline" className={color}>{status}</Badge></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Things we caught, still open</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {mismatches.map((mm) => (
              <div key={mm.id} className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0 text-sm">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${mm.verdict === "block" ? "bg-[color:var(--block)]" : "bg-[color:var(--revise)]"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{mm.id}</span>
                    <Badge variant="outline" className="text-[10px]">{mm.domain}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{mm.reason ?? mm.useCase}</p>
                </div>
                <span className="font-mono text-xs text-primary shrink-0">{mm.retrievedPolicyIds[0]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-[color:var(--block)]" /> Freeze all AI right now?</DialogTitle>
            <DialogDescription>
              This immediately stops every AI request across every model and region. Nothing will get an
              answer until you turn it back on. Use this in a live incident only.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setKillSwitch(true); setConfirming(false); }}>Freeze everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RadialDial({ value, target }: { value: number; target: number }) {
  const pct = Math.min(1, Math.max(0, value));
  const size = 96, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const above = pct >= target;
  return (
    <div className="mt-2 flex items-center gap-4" role="img" aria-label={`Drift precision ${(pct * 100).toFixed(1)} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={above ? "var(--allow)" : "var(--revise)"} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" />
      </svg>
      <div>
        <div className="text-3xl font-semibold font-mono">{(pct * 100).toFixed(1)}<span className="text-base text-muted-foreground">%</span></div>
        <div className={`text-xs font-mono ${above ? "text-[color:var(--allow)]" : "text-[color:var(--revise)]"}`}>{above ? "▲ above" : "▼ below"} target</div>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
