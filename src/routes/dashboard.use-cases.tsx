import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getUseCaseSummaries } from "@/lib/juriscore/mock";

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
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Use Cases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each use case is governed by a domain rulebook. Volume, block rate and citation coverage are computed from the audit log.
        </p>
      </header>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((uc) => (
          <Card key={uc.key}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{uc.name}</CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">{uc.regulatoryDriver}</div>
              </div>
              <Badge variant={uc.domain === "finance" ? "default" : "secondary"} className="capitalize">{uc.domain}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        ))}
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
