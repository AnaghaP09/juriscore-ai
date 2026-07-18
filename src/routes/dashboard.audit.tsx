import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUDIT, type AuditEntry, type Verdict } from "@/lib/juriscore/mock";

export const Route = createFileRoute("/dashboard/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — JurisCore AI" },
      { name: "description", content: "Immutable audit trail for every AI interaction." },
    ],
  }),
  component: AuditLog,
});

function verdictColor(v: Verdict) {
  return v === "allow" ? "bg-[color:var(--allow)]/15 text-[color:var(--allow)] border-[color:var(--allow)]/30" :
    v === "block" ? "bg-[color:var(--block)]/15 text-[color:var(--block)] border-[color:var(--block)]/30" :
    "bg-[color:var(--revise)]/15 text-[color:var(--revise)] border-[color:var(--revise)]/30";
}

function AuditLog() {
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<string>("all");
  const [verdict, setVerdict] = useState<string>("all");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const rows = useMemo(() => {
    return AUDIT.filter((a) => {
      if (domain !== "all" && a.domain !== domain) return false;
      if (verdict !== "all" && a.verdict !== verdict) return false;
      if (q && !(a.id.includes(q) || a.prompt.toLowerCase().includes(q.toLowerCase()) || a.useCase.includes(q))) return false;
      return true;
    }).slice(0, 200);
  }, [q, domain, verdict]);

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Standardized chain: Prompt → Guardrail check → Model response → Final approval. Click any row for the full trace.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search prompt, use case, or ID…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={domain} onValueChange={setDomain}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Domain" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
            <SelectItem value="healthcare">Healthcare</SelectItem>
          </SelectContent>
        </Select>
        <Select value={verdict} onValueChange={setVerdict}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Verdict" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verdicts</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="revise">Revise</SelectItem>
            <SelectItem value="block">Block</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground self-center">Showing {rows.length} of {AUDIT.length}</div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">ID</th>
              <th className="text-left px-4 py-2 font-medium">Time</th>
              <th className="text-left px-4 py-2 font-medium">Domain</th>
              <th className="text-left px-4 py-2 font-medium">Use case</th>
              <th className="text-left px-4 py-2 font-medium">Verdict</th>
              <th className="text-right px-4 py-2 font-medium">Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="border-t border-border/60 hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.ts.slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2 capitalize">{r.domain}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.useCase}</td>
                <td className="px-4 py-2"><Badge className={`border ${verdictColor(r.verdict)}`} variant="outline">{r.verdict}</Badge></td>
                <td className="px-4 py-2 text-right font-mono text-xs">{r.latencyMs}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[540px] sm:max-w-none overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{selected.id}</SheetTitle>
                <SheetDescription>
                  {selected.domain} · {selected.useCase} · {selected.ts.slice(0, 16).replace("T", " ")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 px-1">
                <Stage title="1 · Prompt" body={selected.prompt} />
                <Stage
                  title="2 · Input guardrail"
                  body={selected.blockedStage === "input_guardrail" ? `BLOCKED — ${selected.reason}` : "Passed — no PII/injection detected"}
                  tone={selected.blockedStage === "input_guardrail" ? "block" : "allow"}
                />
                <Stage
                  title="3 · Retrieved policies"
                  body={selected.retrievedPolicyIds.join(", ") || "—"}
                  mono
                />
                <Stage
                  title="4 · Draft response"
                  body={selected.draftResponse}
                />
                <Stage
                  title="5 · Citation check"
                  body={`Coverage ${(selected.citationCoverage * 100).toFixed(0)}%${selected.blockedStage === "citation" ? ` — ${selected.reason}` : ""}`}
                  tone={selected.blockedStage === "citation" ? "block" : selected.citationCoverage < 0.7 ? "revise" : "allow"}
                />
                <Stage
                  title="6 · Final verdict"
                  body={selected.finalResponse ?? `Blocked — ${selected.reason ?? "policy violation"}`}
                  tone={selected.verdict}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stage({ title, body, tone, mono }: { title: string; body: string; tone?: Verdict; mono?: boolean }) {
  const border = tone === "block" ? "border-[color:var(--block)]/40" : tone === "allow" ? "border-[color:var(--allow)]/40" : tone === "revise" ? "border-[color:var(--revise)]/40" : "border-border";
  return (
    <div className={`rounded-md border ${border} bg-muted/20 p-3`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className={mono ? "font-mono text-xs" : "text-sm"}>{body}</div>
    </div>
  );
}
