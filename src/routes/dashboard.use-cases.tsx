import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowRight, Download, FileText, GitPullRequest } from "lucide-react";
import { getUseCaseSummaries } from "@/lib/juriscore/mock";
import { downloadCSV, openPrintReport, kpiCard, htmlTable, escapeHtml } from "@/lib/juriscore/export";

export const Route = createFileRoute("/dashboard/use-cases")({
  head: () => ({
    meta: [
      { title: "Use Cases — JurisCore AI" },
      { name: "description", content: "Governed AI use cases in Finance and Healthcare." },
    ],
  }),
  component: UseCases,
});

function UseCases() {
  const items = getUseCaseSummaries();

  const exportCSV = () => {
    downloadCSV("juriscore_use_cases.csv", items.map((u) => ({
      key: u.key, name: u.name, domain: u.domain, regulatoryDriver: u.regulatoryDriver,
      volume: u.volume, blockRate: u.blockRate, citationCoverage: u.citationCoverage,
      topFailureMode: u.topFailureMode, persona: u.persona ?? "", capability: u.capability ?? "",
      valueProp: u.valueProp ?? "", risk: u.risk ?? "",
    })));
  };

  const exportPDF = () => {
    const totalVol = items.reduce((s, u) => s + u.volume, 0);
    const avgBlock = items.reduce((s, u) => s + u.blockRate, 0) / items.length;
    const avgCov = items.reduce((s, u) => s + u.citationCoverage, 0) / items.length;
    openPrintReport({
      title: "Use Case Portfolio",
      subtitle: `${items.length} governed use cases across Finance & Healthcare`,
      sections: [
        {
          heading: "Portfolio metrics",
          html: `<div class="grid">${[
            kpiCard("Use cases", String(items.length)),
            kpiCard("Total volume (30d)", totalVol.toLocaleString()),
            kpiCard("Avg block rate", `${(avgBlock * 100).toFixed(1)}%`),
            kpiCard("Avg citation coverage", `${(avgCov * 100).toFixed(0)}%`),
          ].join("")}</div>`,
        },
        {
          heading: "Use case matrix",
          html: htmlTable(
            ["Use case", "Domain", "Volume", "Block %", "Coverage %", "Top failure"],
            items.map((u) => [u.name, u.domain, u.volume, (u.blockRate * 100).toFixed(1), (u.citationCoverage * 100).toFixed(0), u.topFailureMode]),
          ),
        },
        {
          heading: "Failure modes & risks",
          html: items.map((u) => `<div style="margin-bottom:12px"><strong>${escapeHtml(u.name)}</strong><br><span style="color:#555">${escapeHtml(u.risk ?? u.failureMode)}</span></div>`).join(""),
        },
      ],
    });
  };

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Use Cases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each use case is governed by a domain rulebook. Click any card for drill-down metrics and audit trail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" aria-hidden />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="h-4 w-4 mr-2" aria-hidden />PDF report</Button>
        </div>
      </header>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((uc) => {
          const isPlumb = uc.key === "plumb-drift";
          return (
            <Card key={uc.key} className={isPlumb ? "border-primary/40" : ""}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {isPlumb && <GitPullRequest className="h-4 w-4 text-primary" aria-hidden />}
                    {uc.name}
                  </CardTitle>
                  <div className="mt-1 text-xs text-muted-foreground">{uc.regulatoryDriver}</div>
                </div>
                <Badge variant={uc.domain === "finance" ? "default" : "secondary"} className="capitalize">{uc.domain}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {uc.tagline && <p className="text-sm text-muted-foreground text-pretty">{uc.tagline}</p>}
                <div className="grid grid-cols-3 gap-4">
                  <Metric label="Volume" value={uc.volume.toString()} />
                  <Metric label="Block rate" value={`${(uc.blockRate * 100).toFixed(1)}%`} />
                  <Metric label="Citations" value={`${(uc.citationCoverage * 100).toFixed(0)}%`} />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Citation coverage</span>
                    <span className="font-mono">{(uc.citationCoverage * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={uc.citationCoverage * 100} />
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <div className="uppercase tracking-wider text-muted-foreground mb-1">Top failure mode</div>
                  <div>{uc.topFailureMode}</div>
                </div>
                <Link
                  to="/dashboard/use-cases/$key"
                  params={{ key: uc.key }}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Drill down <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
    </div>
  );
}
