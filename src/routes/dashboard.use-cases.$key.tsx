import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft, Download, FileText, GitPullRequest, Info } from "lucide-react";
import { AUDIT, getUseCaseSummaries } from "@/lib/juriscore/mock";
import { downloadCSV, openPrintReport, kpiCard, htmlTable, escapeHtml } from "@/lib/juriscore/export";

export const Route = createFileRoute("/dashboard/use-cases/$key")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.key} — Use case · JurisCore AI` },
      { name: "description", content: "Drill-down metrics, failure modes and recent audit trail for a governed use case." },
    ],
  }),
  loader: ({ params }) => {
    const uc = getUseCaseSummaries().find((u) => u.key === params.key);
    if (!uc) throw notFound();
    return { uc };
  },
  component: UseCaseDetail,
  notFoundComponent: NotFoundView,
  errorComponent: ErrorView,
});

function NotFoundView() {
  return (
    <div className="p-8">
      <p className="text-sm text-muted-foreground">Use case not found.</p>
      <Link to="/dashboard/use-cases" className="text-primary text-sm underline">Back to use cases</Link>
    </div>
  );
}

function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="p-8 space-y-3">
      <p className="text-sm text-muted-foreground">Couldn't load this use case.</p>
      <p className="text-xs font-mono text-destructive">{error.message}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { router.invalidate(); reset(); }}>Retry</Button>
        <Link to="/dashboard/use-cases" className="text-primary text-sm underline self-center">Back to use cases</Link>
      </div>
    </div>
  );
}


function UseCaseDetail() {
  const { uc } = Route.useLoaderData();
  const entries = AUDIT.filter((a) => a.useCase === uc.key);
  const recent = entries.slice(0, 25);
  const avgLatency = entries.length ? Math.round(entries.reduce((s, a) => s + a.latencyMs, 0) / entries.length) : 0;
  const blocked = entries.filter((a) => a.verdict === "block").length;
  const revised = entries.filter((a) => a.verdict === "revise").length;

  const reasonCounts: Record<string, number> = {};
  entries.forEach((e) => { if (e.reason) reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1; });
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const exportCSV = () => {
    downloadCSV(`juriscore_${uc.key}_audit.csv`, entries.map((e) => ({
      id: e.id, ts: e.ts, domain: e.domain, useCase: e.useCase, verdict: e.verdict,
      latencyMs: e.latencyMs, blockedStage: e.blockedStage ?? "", reason: e.reason ?? "",
      citationCoverage: e.citationCoverage, policies: e.retrievedPolicyIds.join("|"),
      prompt: e.prompt,
    })));
  };

  const exportPDF = () => {
    openPrintReport({
      title: uc.name,
      subtitle: `Use case · ${uc.domain.toUpperCase()} · Regulatory driver: ${uc.regulatoryDriver}`,
      sections: [
        {
          heading: "Key metrics",
          html: `<div class="grid">${[
            kpiCard("Volume (30d)", uc.volume.toLocaleString()),
            kpiCard("Block rate", `${(uc.blockRate * 100).toFixed(1)}%`),
            kpiCard("Citation coverage", `${(uc.citationCoverage * 100).toFixed(0)}%`),
            kpiCard("Avg latency", `${avgLatency} ms`),
          ].join("")}</div>`,
        },
        ...(uc.persona || uc.capability || uc.valueProp || uc.risk
          ? [{
              heading: "Use case profile",
              html: `<table>${[
                uc.tagline && `<tr><th>Tagline</th><td>${escapeHtml(uc.tagline)}</td></tr>`,
                uc.persona && `<tr><th>Persona</th><td>${escapeHtml(uc.persona)}</td></tr>`,
                uc.capability && `<tr><th>Capability</th><td>${escapeHtml(uc.capability)}</td></tr>`,
                uc.valueProp && `<tr><th>Value</th><td>${escapeHtml(uc.valueProp)}</td></tr>`,
                uc.risk && `<tr><th>Risk / mitigation</th><td>${escapeHtml(uc.risk)}</td></tr>`,
              ].filter(Boolean).join("")}</table>`,
            }]
          : []),
        {
          heading: "Top failure modes",
          html: topReasons.length
            ? htmlTable(["Reason", "Count"], topReasons.map(([r, c]) => [r, c]))
            : "<p>No blocked or revised entries in window.</p>",
        },
        {
          heading: `Recent audit entries (${recent.length})`,
          html: htmlTable(
            ["ID", "Time (UTC)", "Verdict", "Stage", "Latency", "Rule"],
            recent.map((r) => [r.id, r.ts.slice(0, 16).replace("T", " "), r.verdict, r.blockedStage ?? "—", `${r.latencyMs}ms`, r.retrievedPolicyIds[0] ?? "—"]),
          ),
        },
      ],
    });
  };

  const isPlumb = uc.key === "plumb-drift";

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/dashboard/use-cases" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to use cases
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" aria-hidden />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="h-4 w-4 mr-2" aria-hidden />PDF report</Button>
        </div>
      </div>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2 flex-wrap normal-case tracking-normal">
            <Badge variant={uc.domain === "finance" ? "default" : "secondary"} className="capitalize">{uc.domain}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{uc.regulatoryDriver}</Badge>
            {isPlumb && <Badge variant="outline" className="border-primary/50 text-primary gap-1"><GitPullRequest className="h-3 w-3" aria-hidden /> Plumb wedge</Badge>}
          </span>
        }
        title={uc.name}
        description={uc.tagline ?? "What this AI feature does, how often it runs, and when we had to step in."}
      />

      <div className="grid md:grid-cols-4 gap-4">
        <MetricCard label="Volume (30d)" value={uc.volume.toLocaleString()} />
        <MetricCard label="Block rate" value={`${(uc.blockRate * 100).toFixed(1)}%`} tone={uc.blockRate > 0.1 ? "block" : "allow"} />
        <MetricCard label="Citation coverage" value={`${(uc.citationCoverage * 100).toFixed(0)}%`} tone={uc.citationCoverage > 0.8 ? "allow" : "revise"} />
        <MetricCard label="Avg latency" value={`${avgLatency}ms`} />
      </div>

      {(uc.persona || uc.capability || uc.valueProp || uc.risk) && (
        <div className="grid md:grid-cols-2 gap-4">
          {uc.persona && <ProfileCard title="Persona" body={uc.persona} />}
          {uc.capability && <ProfileCard title="Capability" body={uc.capability} />}
          {uc.valueProp && <ProfileCard title="Value delivered" body={uc.valueProp} tone="allow" />}
          {uc.risk && <ProfileCard title="Risk & mitigation" body={uc.risk} tone="revise" />}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Verdict mix</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <VerdictBar label="Allowed" count={entries.length - blocked - revised} total={entries.length} color="var(--allow)" />
            <VerdictBar label="Revised" count={revised} total={entries.length} color="var(--revise)" />
            <VerdictBar label="Blocked" count={blocked} total={entries.length} color="var(--block)" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Top failure modes</CardTitle></CardHeader>
          <CardContent>
            {topReasons.length === 0 && <p className="text-sm text-muted-foreground">No blocked or revised entries in window.</p>}
            <ul className="space-y-2">
              {topReasons.map(([reason, count]) => (
                <li key={reason} className="flex items-center justify-between text-sm gap-4">
                  <span className="text-muted-foreground truncate">{reason}</span>
                  <span className="font-mono text-xs">{count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Recent audit entries</CardTitle>
          <span className="text-xs text-muted-foreground">Showing {recent.length} of {entries.length}</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="text-left px-4 py-2 font-medium">ID</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Time</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Verdict</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Rule</th>
                  <th scope="col" className="text-right px-4 py-2 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{r.ts.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-4 py-2 capitalize">{r.verdict}</td>
                    <td className="px-4 py-2 font-mono text-xs text-primary">{r.retrievedPolicyIds[0] ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{r.latencyMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: "allow" | "block" | "revise" }) {
  const c = tone === "allow" ? "text-[color:var(--allow)]" : tone === "block" ? "text-[color:var(--block)]" : tone === "revise" ? "text-[color:var(--revise)]" : "";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-2 text-2xl font-mono font-semibold ${c}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ title, body, tone }: { title: string; body: string; tone?: "allow" | "revise" }) {
  const border = tone === "allow" ? "border-[color:var(--allow)]/30" : tone === "revise" ? "border-[color:var(--revise)]/30" : "border-border";
  return (
    <Card className={border}>
      <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-pretty">{body}</p></CardContent>
    </Card>
  );
}

function VerdictBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{count} · {pct.toFixed(1)}%</span>
      </div>
      <Progress value={pct} className="[&>*]:!bg-current" style={{ color }} />
    </div>
  );
}
