import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LEADS } from "@/lib/juriscore/legal-mock";

export const Route = createFileRoute("/dashboard/intake")({
  head: () => ({
    meta: [
      { title: "Intake — JurisCore AI" },
      { name: "description", content: "New client leads and intake requests." },
    ],
  }),
  component: IntakePage,
});

function IntakePage() {
  const leads = LEADS;
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Work"
        icon={<Inbox className="h-5 w-5" aria-hidden />}
        title="Intake"
        description="New client leads waiting to be triaged into matters."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New matter from lead
          </Button>
        }
      />

      {leads.length === 0 ? (
        <EmptyState />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent leads ({leads.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-medium">Client</th>
                    <th scope="col" className="px-6 py-3 font-medium">Intent</th>
                    <th scope="col" className="px-6 py-3 font-medium">Channel</th>
                    <th scope="col" className="px-6 py-3 font-medium">Type</th>
                    <th scope="col" className="px-6 py-3 font-medium">Received</th>
                    <th scope="col" className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3 font-medium">{l.client}</td>
                      <td className="px-6 py-3 text-muted-foreground">{l.intent}</td>
                      <td className="px-6 py-3"><Badge variant="secondary">{l.channel}</Badge></td>
                      <td className="px-6 py-3 text-muted-foreground">{l.matterType}</td>
                      <td className="px-6 py-3 text-muted-foreground tabular-nums">
                        {new Date(l.receivedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button size="sm" variant="outline">Open</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-border/40">
              {leads.map((l) => (
                <li key={l.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{l.client}</div>
                    <Badge variant="secondary" className="shrink-0">{l.channel}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{l.intent}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {l.matterType} · {new Date(l.receivedAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-16 text-center space-y-3">
        <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="font-medium">No new leads right now</div>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          When someone submits a request through your web form, email, or phone intake, it will show up here.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button size="sm" asChild><Link to="/dashboard">Back to overview</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
