import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_REVIEW, type AiReviewItem, type MatterType } from "@/lib/juriscore/legal-mock";

export const Route = createFileRoute("/dashboard/ai-review")({
  head: () => ({
    meta: [
      { title: "AI Review Queue — JurisCore AI" },
      { name: "description", content: "AI outputs that need a human before they go out." },
    ],
  }),
  component: AiReviewPage,
});

const OUTCOME_LABEL: Record<AiReviewItem["outcome"], string> = {
  human_review: "Needs human",
  revise: "Revise",
  block: "Block",
};

const OUTCOME_STYLE: Record<AiReviewItem["outcome"], string> = {
  human_review: "bg-accent/60 text-accent-foreground",
  revise: "bg-[color:var(--revise)]/20 text-[color:oklch(0.35_0.08_80)]",
  block: "bg-[color:var(--block)]/12 text-[color:var(--block)]",
};

function AiReviewPage() {
  const [outcome, setOutcome] = React.useState<string>("all");
  const [minConf, setMinConf] = React.useState<string>("any");
  const [type, setType] = React.useState<string>("all");
  const [owner, setOwner] = React.useState<string>("all");

  const owners = Array.from(new Set(AI_REVIEW.map((r) => r.owner)));
  const types = Array.from(new Set(AI_REVIEW.map((r) => r.matterType)));

  const filtered = AI_REVIEW.filter((r) => {
    if (outcome !== "all" && r.outcome !== outcome) return false;
    if (type !== "all" && r.matterType !== (type as MatterType)) return false;
    if (owner !== "all" && r.owner !== owner) return false;
    if (minConf === "low" && r.confidence >= 0.75) return false;
    if (minConf === "high" && r.confidence < 0.75) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="AI Governance"
        icon={<Sparkles className="h-5 w-5" aria-hidden />}
        title="AI review queue"
        description="Every AI-generated output that JurisCore held back for a human — with the why, the confidence, and the recommended next step."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FilterField label="Outcome">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="human_review">Needs human</SelectItem>
                <SelectItem value="revise">Revise</SelectItem>
                <SelectItem value="block">Block</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Confidence">
            <Select value={minConf} onValueChange={setMinConf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="low">Low (&lt; 0.75)</SelectItem>
                <SelectItem value="high">High (≥ 0.75)</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Matter type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Owner">
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
        </CardContent>
      </Card>

      <div aria-live="polite" className="text-xs text-muted-foreground">
        Showing {filtered.length} of {AI_REVIEW.length} items.
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nothing matches these filters — try widening the outcome or confidence.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => <ReviewRow key={r.id} item={r} />)}
        </ul>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function ReviewRow({ item }: { item: AiReviewItem }) {
  const conf = Math.round(item.confidence * 100);
  const cite = Math.round(item.citationCoverage * 100);
  return (
    <li>
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground tabular-nums">
                {item.matterId} · {item.matterType} · {item.owner}
              </div>
              <div className="font-medium mt-0.5">{item.matterTitle}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={OUTCOME_STYLE[item.outcome]}>{OUTCOME_LABEL[item.outcome]}</Badge>
              <Badge variant="outline" className="tabular-nums">Confidence {conf}%</Badge>
              <Badge variant="outline" className="tabular-nums">Citations {cite}%</Badge>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="eyebrow mb-1">Why flagged</div>
              <p className="text-muted-foreground">{item.whyFlagged}</p>
            </div>
            <div>
              <div className="eyebrow mb-1">Recommended next step</div>
              <p className="text-muted-foreground">{item.recommendation}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="text-xs text-muted-foreground tabular-nums">
              {new Date(item.ts).toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">Approve as-is</Button>
              <Button size="sm" variant="outline">Send back to author</Button>
              {item.auditId && (
                <Button size="sm" variant="ghost" asChild className="gap-1.5">
                  <Link to="/dashboard/audit">
                    View receipt <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
