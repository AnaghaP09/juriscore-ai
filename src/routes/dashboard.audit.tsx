import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText } from "lucide-react";
import { AUDIT, type AuditEntry, type Verdict } from "@/lib/juriscore/mock";
import { downloadCSV, openPrintReport, htmlTable, kpiCard } from "@/lib/juriscore/export";

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
    <div className="p-4 sm:p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Standardized chain: Prompt → Guardrail check → Model response → Final approval. Select any row for the full trace.
        </p>
      </header>

      <div className="flex flex-wrap gap-3" role="search" aria-label="Filter audit entries">
        <div className="flex-1 min-w-[12rem] max-w-xs">
          <label htmlFor="audit-search" className="sr-only">Search audit entries</label>
          <Input id="audit-search" type="search" placeholder="Search prompt, use case, or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label htmlFor="audit-domain" className="sr-only">Filter by domain</label>
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger id="audit-domain" className="w-40"><SelectValue placeholder="Domain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              <SelectItem value="healthcare">Healthcare</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="audit-verdict" className="sr-only">Filter by verdict</label>
          <Select value={verdict} onValueChange={setVerdict}>
            <SelectTrigger id="audit-verdict" className="w-40"><SelectValue placeholder="Verdict" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All verdicts</SelectItem>
              <SelectItem value="allow">Allow</SelectItem>
              <SelectItem value="revise">Revise</SelectItem>
              <SelectItem value="block">Block</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div aria-live="polite" className="ml-auto text-sm text-muted-foreground self-center">
          Showing {rows.length} of {AUDIT.length}
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          downloadCSV("juriscore_audit.csv", rows.map((r) => ({
            id: r.id, ts: r.ts, domain: r.domain, useCase: r.useCase, verdict: r.verdict,
            latencyMs: r.latencyMs, blockedStage: r.blockedStage ?? "", reason: r.reason ?? "",
            ruleId: r.retrievedPolicyIds[0] ?? "", citationCoverage: r.citationCoverage, prompt: r.prompt,
          })));
        }}><Download className="h-4 w-4 mr-2" aria-hidden />CSV</Button>
        <Button variant="outline" size="sm" onClick={() => {
          const blocked = rows.filter((r) => r.verdict === "block").length;
          const revised = rows.filter((r) => r.verdict === "revise").length;
          openPrintReport({
            title: "Audit Ledger Export",
            subtitle: `${rows.length} entries · filters: domain=${domain}, verdict=${verdict}${q ? `, query="${q}"` : ""}`,
            sections: [
              { heading: "Summary", html: `<div class="grid">${[
                kpiCard("Entries", String(rows.length)),
                kpiCard("Blocked", String(blocked)),
                kpiCard("Revised", String(revised)),
                kpiCard("Allowed", String(rows.length - blocked - revised)),
              ].join("")}</div>` },
              { heading: "Entries", html: htmlTable(
                ["ID", "Time (UTC)", "Domain", "Use case", "Verdict", "Rule", "Latency", "Reason"],
                rows.map((r) => [r.id, r.ts.slice(0, 16).replace("T", " "), r.domain, r.useCase, r.verdict, r.retrievedPolicyIds[0] ?? "—", `${r.latencyMs}ms`, r.reason ?? "—"]),
              ) },
            ],
          });
        }}><FileText className="h-4 w-4 mr-2" aria-hidden />PDF</Button>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm" aria-label="Audit log entries">
          <caption className="sr-only">
            Audit entries, sortable by verdict and domain. Activate a row to open its full trace.
          </caption>
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="text-left px-4 py-2 font-medium">ID</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Time</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Target LLM</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Domain</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Use case</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Rule ID</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Verdict</th>
              <th scope="col" className="text-right px-4 py-2 font-medium">Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const modelIdx = r.id.charCodeAt(r.id.length - 1) % 3;
              const model = ["gemini-1.5-pro", "claude-3.5-sonnet", "gpt-4o"][modelIdx];
              return (
              <tr
                key={r.id}
                tabIndex={0}
                role="button"
                aria-label={`Open trace for ${r.id}, ${r.verdict}, ${r.useCase}`}
                onClick={() => setSelected(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(r);
                  }
                }}
                className="border-t border-border/60 hover:bg-muted/30 focus:bg-muted/40 cursor-pointer outline-none"
              >
                <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{r.ts.slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2 font-mono text-xs">{model}</td>
                <td className="px-4 py-2 capitalize">{r.domain}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.useCase}</td>
                <td className="px-4 py-2 font-mono text-xs text-primary">{r.retrievedPolicyIds[0] ?? "—"}</td>
                <td className="px-4 py-2"><Badge className={`border ${verdictColor(r.verdict)}`} variant="outline">{r.verdict}</Badge></td>
                <td className="px-4 py-2 text-right font-mono text-xs">{r.latencyMs}ms</td>
              </tr>
            );})}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No entries match the current filters.</td></tr>
            )}

          </tbody>
        </table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
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
