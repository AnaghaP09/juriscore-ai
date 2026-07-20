import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AUDIT, getMetrics, getUseCaseSummaries } from "@/lib/juriscore/mock";
import { downloadCSV, openPrintReport, kpiCard, htmlTable } from "@/lib/juriscore/export";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shield, AlertTriangle, Timer, Rocket, Download, FileText } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Overview — JurisCore AI Dashboard" },
      { name: "description", content: "KPIs across Finance and Healthcare AI activity." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const m = getMetrics();
  const stageData = Object.entries(m.blockedByStage).map(([k, v]) => ({
    stage: k.replace(/_/g, " "),
    count: v,
  }));
  const domainData = m.byDomain.map((d) => ({
    name: d.domain === "finance" ? "Finance" : "Healthcare",
    total: d.total,
    blocked: d.blocked,
  }));

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Governance Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Universal visibility for CISOs &amp; CCOs · last 30 days</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">{m.kpis.totalRequests.toLocaleString()} requests</Badge>
          <Button variant="outline" size="sm" onClick={() => {
            downloadCSV("juriscore_daily_metrics.csv", m.series);
          }}><Download className="h-4 w-4 mr-2" aria-hidden />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => {
            const uc = getUseCaseSummaries();
            openPrintReport({
              title: "Governance Overview",
              subtitle: `Last 30 days · ${m.kpis.totalRequests.toLocaleString()} total requests · ${AUDIT.length} audit entries`,
              sections: [
                { heading: "Key KPIs", html: `<div class="grid">${[
                  kpiCard("Violation rate", `${(m.kpis.violationRate * 100).toFixed(2)}%`, "Target ≤ 0.5%"),
                  kpiCard("Guardrail accuracy", `${(m.kpis.guardrailAccuracy * 100).toFixed(1)}%`),
                  kpiCard("Audit prep time", `${m.kpis.auditPrepMinutes} min`, "Was: multiple days"),
                  kpiCard("Time to ship", `${m.kpis.timeToShipDaysAfter} days`, `Was ${m.kpis.timeToShipDaysBefore} days`),
                  kpiCard("Avg latency", `${m.kpis.avgLatencyMs} ms`),
                  kpiCard("Citation coverage", `${(m.kpis.citationCoverage * 100).toFixed(0)}%`),
                  kpiCard("Allowed", `${(m.kpis.allowedRate * 100).toFixed(1)}%`),
                  kpiCard("Revised", `${(m.kpis.revisedRate * 100).toFixed(1)}%`),
                ].join("")}</div>` },
                { heading: "Blocks by pipeline stage", html: htmlTable(["Stage", "Count"], Object.entries(m.blockedByStage).map(([s, c]) => [s.replace(/_/g, " "), c])) },
                { heading: "Domain breakdown", html: htmlTable(["Domain", "Total", "Blocked"], m.byDomain.map((d) => [d.domain, d.total, d.blocked])) },
                { heading: "Use case portfolio", html: htmlTable(["Use case", "Domain", "Volume", "Block %", "Coverage %"], uc.map((u) => [u.name, u.domain, u.volume, (u.blockRate * 100).toFixed(1), (u.citationCoverage * 100).toFixed(0)])) },
                { heading: "Daily volume (last 30d)", html: htmlTable(["Day", "Allowed", "Revised", "Blocked"], m.series.map((s) => [s.day, s.allowed, s.revised, s.blocked])) },
              ],
            });
          }}><FileText className="h-4 w-4 mr-2" aria-hidden />PDF report</Button>
        </div>
      </header>

      <div className="grid md:grid-cols-4 gap-4">
        <Kpi icon={AlertTriangle} label="Violation rate" value={`${(m.kpis.violationRate * 100).toFixed(2)}%`} sub={`Target ≤ 0.5% — ${(m.kpis.violationRate * m.kpis.totalRequests).toFixed(0)} blocked`} tone="block" />
        <Kpi icon={Shield} label="Guardrail accuracy" value={`${(m.kpis.guardrailAccuracy * 100).toFixed(1)}%`} sub="Human-labeled feedback loop" tone="allow" />
        <Kpi icon={Timer} label="Audit prep time" value={`${m.kpis.auditPrepMinutes} min`} sub="Was: multiple days" tone="allow" />
        <Kpi icon={Rocket} label="Time to ship" value={`${m.kpis.timeToShipDaysAfter} days`} sub={`Was ${m.kpis.timeToShipDaysBefore} days pre-JurisCore`} tone="allow" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Requests over time</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.series}>
                <defs>
                  <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--allow)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--allow)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--block)" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="var(--block)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="allowed" stroke="var(--allow)" fill="url(#ga)" />
                <Area type="monotone" dataKey="revised" stroke="var(--revise)" fill="none" />
                <Area type="monotone" dataKey="blocked" stroke="var(--block)" fill="url(#gb)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Blocks by stage</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis type="category" dataKey="stage" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="count" fill="var(--primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Domain split</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={domainData} dataKey="total" nameKey="name" innerRadius={50} outerRadius={80}>
                  {domainData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-4)"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Latency budget</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Avg</div>
                <div className="text-3xl font-semibold font-mono mt-1">{m.kpis.avgLatencyMs}<span className="text-base text-muted-foreground ml-1">ms</span></div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Citation coverage</div>
                <div className="text-3xl font-semibold font-mono mt-1">{(m.kpis.citationCoverage * 100).toFixed(0)}<span className="text-base text-muted-foreground ml-1">%</span></div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Allowed</div>
                <div className="text-3xl font-semibold font-mono mt-1">{(m.kpis.allowedRate * 100).toFixed(1)}<span className="text-base text-muted-foreground ml-1">%</span></div>
              </div>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Every request flows through four stages. Below the 800ms budget the pipeline stays viable for realtime use cases.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string; tone: "allow" | "block" | "revise" }) {
  const toneColor = tone === "allow" ? "text-[color:var(--allow)]" : tone === "block" ? "text-[color:var(--block)]" : "text-[color:var(--revise)]";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-2 text-3xl font-semibold font-mono">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
          </div>
          <Icon className={`h-5 w-5 ${toneColor}`} />
        </div>
      </CardContent>
    </Card>
  );
}
