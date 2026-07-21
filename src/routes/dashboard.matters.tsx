import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { Briefcase, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { getTriageQueue } from "@/lib/juriscore/legal-mock";

export const Route = createFileRoute("/dashboard/matters")({
  head: () => ({
    meta: [
      { title: "Matters — JurisCore AI" },
      { name: "description", content: "All active matters, sorted by priority." },
    ],
  }),
  component: MattersPage,
});

function MattersPage() {
  const all = getTriageQueue();
  const [q, setQ] = React.useState("");
  const filtered = all.filter((m) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      m.id.toLowerCase().includes(s) ||
      m.client.toLowerCase().includes(s) ||
      m.title.toLowerCase().includes(s) ||
      m.owner.toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Work"
        icon={<Briefcase className="h-5 w-5" aria-hidden />}
        title="Matters"
        description="Every active matter across the firm, sorted by urgency."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New matter
          </Button>
        }
      />

      <div className="relative max-w-md" role="search">
        <label htmlFor="matter-search" className="sr-only">Search matters</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          id="matter-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by client, matter, or owner…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No matters match your search.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Matters, sorted by triage priority</caption>
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-medium">Matter</th>
                    <th scope="col" className="px-6 py-3 font-medium">Client</th>
                    <th scope="col" className="px-6 py-3 font-medium">Type</th>
                    <th scope="col" className="px-6 py-3 font-medium">Status</th>
                    <th scope="col" className="px-6 py-3 font-medium">Owner</th>
                    <th scope="col" className="px-6 py-3 font-medium">Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3">
                        <div className="font-medium">{m.title}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{m.id}</div>
                      </td>
                      <td className="px-6 py-3">{m.client}</td>
                      <td className="px-6 py-3 text-muted-foreground">{m.type}</td>
                      <td className="px-6 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-6 py-3 text-muted-foreground">{m.owner}</td>
                      <td className="px-6 py-3 tabular-nums text-muted-foreground">{m.deadline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-border/40">
              {filtered.map((m) => (
                <li key={m.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.title}</div>
                      <div className="text-xs text-muted-foreground">{m.client} · {m.id}</div>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.owner} · Due {m.deadline}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Need the receipts?{" "}
        <Link to="/dashboard/audit" className="underline hover:text-foreground">Open the audit log</Link>.
      </p>
    </div>
  );
}
