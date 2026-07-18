import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RULEBOOKS, POLICIES } from "@/lib/juriscore/mock";
import { BookOpen, Upload, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/rulebooks")({
  head: () => ({
    meta: [
      { title: "Rulebooks — JurisCore AI" },
      { name: "description", content: "Manage domain rulebooks: SEC, FINRA, HIPAA, CMS." },
    ],
  }),
  component: Rulebooks,
});

function Rulebooks() {
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Rulebooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each rulebook is a versioned collection of policy clauses used by the RAG core.
          </p>
        </div>
        <Button onClick={() => toast.info("Demo build — upload disabled.")}>
          <Upload className="mr-2 h-4 w-4" /> Add rulebook
        </Button>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {RULEBOOKS.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" /> {r.name}
                </CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">{r.agency} · {r.domain}</div>
              </div>
              <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><div className="text-xs uppercase text-muted-foreground">Documents</div><div className="font-mono text-lg">{r.docCount}</div></div>
                <div><div className="text-xs uppercase text-muted-foreground">Clauses</div><div className="font-mono text-lg">{r.clauseCount}</div></div>
                <div><div className="text-xs uppercase text-muted-foreground">Updated</div><div className="font-mono text-lg">{r.lastUpdated.slice(5)}</div></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Coverage vs current regulation</span>
                  <span className="font-mono">{(r.coverage * 100).toFixed(0)}%</span>
                </div>
                <Progress value={r.coverage * 100} />
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Sample clauses</div>
                {POLICIES.filter((p) => p.rulebook === r.id).slice(0, 3).map((p) => (
                  <div key={p.id} className="flex gap-2 text-xs items-start">
                    <FileText className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <span className="font-mono text-primary">{p.id}</span>
                      <span className="text-muted-foreground"> — {p.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
