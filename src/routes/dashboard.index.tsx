import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import {
  MATTERS,
  HEARINGS,
  LEGAL_ALERTS,
  AI_REVIEW,
  getPriorityCounts,
  getTriageQueue,
  getDefaultSelectedMatter,
  isThisWeek,
  type Matter,
} from "@/lib/juriscore/legal-mock";
import { getMetrics } from "@/lib/juriscore/mock";
import {
  Search,
  Plus,
  Upload,
  FileText,
  ScrollText,
  Gavel,
  UserPlus,
  AlertTriangle,
  FileSignature,
  Bot,
  CalendarClock,
  Bell,
  ArrowRight,
  Sparkles,
  ClipboardCheck,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Overview — JurisCore AI" },
      { name: "description", content: "What needs your attention now across matters, contracts, hearings and AI review." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const counts = getPriorityCounts();
  const queue = getTriageQueue();
  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => getDefaultSelectedMatter()?.id ?? null,
  );
  const [query, setQuery] = React.useState("");

  const selected = selectedId ? MATTERS.find((m) => m.id === selectedId) ?? null : null;
  const filteredQueue = query.trim()
    ? queue.filter((m) => {
        const q = query.toLowerCase();
        return (
          m.id.toLowerCase().includes(q) ||
          m.client.toLowerCase().includes(q) ||
          m.title.toLowerCase().includes(q) ||
          m.owner.toLowerCase().includes(q)
        );
      })
    : queue;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Command bar */}
      <section aria-label="Command bar" className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <div className="eyebrow">This week · single workspace</div>
            <h1 className="page-title mt-1">Good morning — here's what needs you</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" aria-hidden />New matter</Button>
            <Button size="sm" variant="outline" className="gap-1.5"><Upload className="h-4 w-4" aria-hidden />Upload document</Button>
          </div>
        </div>

        <div role="search" className="flex flex-wrap items-center gap-2">
          <label htmlFor="cmd-search" className="sr-only">Search matters, clients, documents, contracts, hearings</label>
          <div className="relative flex-1 min-w-[220px]">
            <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="cmd-search"
              placeholder="Search matter ID, client, document, contract, hearing…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link to="/dashboard/audit" className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card hover:bg-muted px-3 py-1.5 text-xs font-medium">
              <Bot className="h-3.5 w-3.5" aria-hidden /> Review AI queue
            </Link>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card hover:bg-muted px-3 py-1.5 text-xs font-medium">
              <FileSignature className="h-3.5 w-3.5" aria-hidden /> Create contract
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card hover:bg-muted px-3 py-1.5 text-xs font-medium">
              <Gavel className="h-3.5 w-3.5" aria-hidden /> Track case
            </button>
          </div>
        </div>
      </section>

      {/* Priority strip */}
      <section aria-label="Priority" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <PriorityCard icon={UserPlus} label="New leads" value={counts.newLeads} sub="Last 24h" to="/dashboard/audit" />
        <PriorityCard icon={AlertTriangle} label="Urgent matters" value={counts.urgentMatters} sub="Escalated + urgent" tone="block" />
        <PriorityCard icon={FileSignature} label="Contracts to sign" value={counts.contractsAwaitingSig} sub="Awaiting client / review" tone="revise" />
        <PriorityCard icon={Bot} label="AI needs review" value={counts.aiNeedsReview} sub="Low confidence or blocked" to="/dashboard/audit" tone="revise" />
        <PriorityCard icon={CalendarClock} label="Hearings this week" value={counts.hearingsThisWeek} sub="Next 7 days" />
        <PriorityCard icon={Bell} label="Monitoring alerts" value={counts.monitoringAlerts} sub="Compliance + high sev" />
      </section>

      {/* Work area */}
      {queue.length === 0 ? (
        <EmptyState />
      ) : (
        <section aria-label="Work area" className="grid gap-4 lg:grid-cols-12">
          {/* Left: triage queue */}
          <Card className="lg:col-span-4 min-w-0">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-sm font-semibold">Triage queue</CardTitle>
              <Badge variant="outline" className="text-[10px]">{filteredQueue.length}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <ul role="listbox" aria-label="Matters to triage" className="max-h-[520px] overflow-y-auto divide-y divide-border/60">
                {filteredQueue.map((m) => {
                  const active = m.id === selectedId;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setSelectedId(m.id)}
                        className={`w-full text-left px-4 py-3 focus:outline-none focus-visible:bg-muted hover:bg-muted/60 transition-colors ${active ? "bg-muted" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">{m.id}</span>
                          <StatusBadge status={m.status} />
                        </div>
                        <div className="mt-1 text-sm font-medium truncate">{m.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">
                          {m.client} · {m.owner} · due {m.deadline.slice(5)}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {filteredQueue.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">No matters match "{query}"</li>
                )}
              </ul>
            </CardContent>
          </Card>

          {/* Center: selected matter */}
          <Card className="lg:col-span-5 min-w-0">
            {selected ? <MatterPanel matter={selected} /> : <NoSelection />}
          </Card>

          {/* Right: AI recommendations + alerts */}
          <div className="lg:col-span-3 min-w-0 space-y-4">
            <AiRecommendationsCard selected={selected} />
            <UpcomingCard />
            <AlertsCard />
          </div>
        </section>
      )}

      {/* Secondary analytics */}
      <section aria-label="Analytics snapshot" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Trend</div>
            <h2 className="section-title mt-1">Activity, last 30 days</h2>
          </div>
          <Link to="/dashboard/analytics" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            See full analytics <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <MiniTrend />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PriorityCard({
  icon: Icon,
  label,
  value,
  sub,
  to,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub: string;
  to?: string;
  tone?: "allow" | "block" | "revise";
}) {
  const toneColor =
    tone === "block"
      ? "text-[color:var(--block)]"
      : tone === "revise"
        ? "text-[color:var(--revise)]"
        : tone === "allow"
          ? "text-[color:var(--allow)]"
          : "text-primary";
  const body = (
    <Card className="h-full hover:shadow-lg transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
            <div className="stat-value mt-1.5 text-3xl">{value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</div>
          </div>
          <Icon aria-hidden className={`h-5 w-5 shrink-0 ${toneColor}`} />
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="block focus-visible:rounded-2xl">{body}</Link> : body;
}

function MatterPanel({ matter }: { matter: Matter }) {
  const hearings = HEARINGS.filter((h) => h.matterId === matter.id);
  return (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{matter.id}</span>
              <StatusBadge status={matter.status} />
              <Badge variant="outline" className="text-[10px]">{matter.type}</Badge>
            </div>
            <CardTitle className="mt-1.5 text-lg leading-tight">{matter.title}</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {matter.client} · {matter.owner} · opened {matter.openedAt.slice(5)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase text-muted-foreground">Deadline</div>
            <div className="text-sm font-semibold">{matter.deadline}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground/90">{matter.summary}</p>

        <div className="grid grid-cols-3 gap-3 text-center">
          <StatCell label="Documents" value={matter.documentCount} />
          <StatCell label="Unread" value={matter.unreadCount} />
          <StatCell label="Contracts" value={matter.linkedContractIds.length} />
        </div>

        {hearings.length > 0 && (
          <div>
            <div className="eyebrow mb-1.5">Upcoming</div>
            <ul className="space-y-1.5">
              {hearings.map((h) => (
                <li key={h.id} className="flex items-center justify-between text-sm border border-border/60 rounded-lg px-3 py-2">
                  <span className="truncate"><span className="font-medium">{h.type}</span> · {h.forum}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{h.when.slice(5, 16).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="eyebrow mb-1.5">Timeline</div>
          <ol className="space-y-2">
            {matter.timeline.map((t, i) => (
              <li key={i} className="text-sm flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-hidden />
                <div className="min-w-0">
                  <div className="truncate"><span className="font-medium">{t.actor}</span> — {t.event}</div>
                  <div className="text-[11px] text-muted-foreground">{t.ts.slice(0, 16).replace("T", " ")}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" className="gap-1.5"><ClipboardCheck className="h-4 w-4" aria-hidden />Take next step</Button>
          <Button size="sm" variant="outline" className="gap-1.5"><FileText className="h-4 w-4" aria-hidden />Open documents</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" asChild>
            <Link to="/dashboard/audit"><ScrollText className="h-4 w-4" aria-hidden />Audit trail</Link>
          </Button>
        </div>
      </CardContent>
    </>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-xl font-semibold font-mono">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function NoSelection() {
  return (
    <CardContent className="py-16 text-center">
      <p className="text-sm text-muted-foreground">Select a matter to see details.</p>
    </CardContent>
  );
}

function AiRecommendationsCard({ selected }: { selected: Matter | null }) {
  const items = selected
    ? AI_REVIEW.filter((r) => r.matterId === selected.id)
    : AI_REVIEW.slice(0, 2);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          AI recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">No AI flags on this matter. You're clear.</p>
        )}
        {items.map((r) => (
          <div key={r.id} className="rounded-lg border border-border/60 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Badge
                variant="outline"
                className={
                  r.outcome === "block"
                    ? "text-[color:var(--block)] border-[color:var(--block)]/40"
                    : r.outcome === "revise"
                      ? "text-[color:var(--revise)] border-[color:var(--revise)]/40"
                      : ""
                }
              >
                {r.outcome === "human_review" ? "Needs review" : r.outcome === "revise" ? "Revise" : "Blocked"}
              </Badge>
              <span className="text-[11px] font-mono text-muted-foreground">
                {(r.confidence * 100).toFixed(0)}% conf
              </span>
            </div>
            <div className="text-xs"><span className="font-medium">Why:</span> {r.whyFlagged}</div>
            <div className="text-xs"><span className="font-medium">Next:</span> {r.recommendation}</div>
            <div className="text-[10px] text-muted-foreground">Citations {(r.citationCoverage * 100).toFixed(0)}% · {r.auditId}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function UpcomingCard() {
  const upcoming = HEARINGS.filter((h) => isThisWeek(h.when)).slice(0, 4);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
          This week
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.map((h) => (
          <div key={h.id} className="flex items-start justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="font-medium truncate">{h.type} · {h.client}</div>
              <div className="text-muted-foreground truncate">{h.forum}</div>
            </div>
            <div className="text-muted-foreground shrink-0 font-mono">{h.when.slice(5, 10)}</div>
          </div>
        ))}
        {upcoming.length === 0 && <p className="text-xs text-muted-foreground">Nothing scheduled.</p>}
      </CardContent>
    </Card>
  );
}

function AlertsCard() {
  const alerts = LEGAL_ALERTS.slice(0, 3);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" aria-hidden />
          Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className="text-xs border-l-2 pl-2.5"
               style={{ borderColor: a.severity === "high" ? "var(--block)" : a.severity === "medium" ? "var(--revise)" : "var(--border)" }}>
            <div className="font-medium">{a.title}</div>
            <div className="text-muted-foreground">{a.detail}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-16 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center">
          <ClipboardCheck className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">No active matters to review right now</p>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" aria-hidden />New matter</Button>
          <Button size="sm" variant="outline" className="gap-1.5"><Upload className="h-4 w-4" aria-hidden />Upload document</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniTrend() {
  const m = getMetrics();
  return (
    <Card>
      <CardContent className="h-56 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={m.series}>
            <defs>
              <linearGradient id="ov-a" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
            <Area type="monotone" dataKey="allowed" stroke="var(--primary)" fill="url(#ov-a)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
