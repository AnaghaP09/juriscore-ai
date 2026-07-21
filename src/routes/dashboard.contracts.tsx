import { createFileRoute } from "@tanstack/react-router";
import { FileSignature, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { CONTRACTS } from "@/lib/juriscore/legal-mock";

export const Route = createFileRoute("/dashboard/contracts")({
  head: () => ({
    meta: [
      { title: "Contracts — JurisCore AI" },
      { name: "description", content: "Contracts in flight and their status." },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Work"
        icon={<FileSignature className="h-5 w-5" aria-hidden />}
        title="Contracts"
        description="Track every contract from draft to signed."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> New contract
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">Contract</th>
                  <th scope="col" className="px-6 py-3 font-medium">Counterparty</th>
                  <th scope="col" className="px-6 py-3 font-medium">Status</th>
                  <th scope="col" className="px-6 py-3 font-medium">Value</th>
                  <th scope="col" className="px-6 py-3 font-medium">Owner</th>
                  <th scope="col" className="px-6 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {CONTRACTS.map((c) => (
                  <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-3">
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{c.id}</div>
                    </td>
                    <td className="px-6 py-3">{c.counterparty}</td>
                    <td className="px-6 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-6 py-3 tabular-nums">{c.value}</td>
                    <td className="px-6 py-3 text-muted-foreground">{c.owner}</td>
                    <td className="px-6 py-3 tabular-nums text-muted-foreground">{c.dueBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden divide-y divide-border/40">
            {CONTRACTS.map((c) => (
              <li key={c.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{c.counterparty} · {c.id}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {c.value} · Due {c.dueBy}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
