import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import {
  ArrowRight,
  BookOpen,
  EyeOff,
  GitPullRequest,
  LayoutDashboard,
  ReceiptText,
} from "lucide-react";
import { useDemoStore, type SessionModuleChecks } from "@/lib/juriscore/demo-store";
import { policyById, type PolicyDefinition } from "@/lib/juriscore/policies/catalog";
import type { ValidationModule } from "@/lib/juriscore/core/contracts";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Overview — JurisCore" },
      {
        name: "description",
        content:
          "Session activity for Veil and Plumb checks, active policies, and receipts.",
      },
    ],
  }),
  component: Overview,
});

const verdictColor = {
  allow: "text-[color:var(--allow)] border-[color:var(--allow)]/40",
  revise: "text-[color:var(--revise)] border-[color:var(--revise)]/40",
  block: "text-[color:var(--block)] border-[color:var(--block)]/40",
};

const DEMO_LINKS: Array<{ label: string; to: string }> = [
  { label: "Gateway", to: "/dashboard/gateway" },
  { label: "Pipeline", to: "/dashboard/pipeline" },
  { label: "Analytics", to: "/dashboard/analytics" },
  { label: "Use cases", to: "/dashboard/use-cases" },
  { label: "CISO view", to: "/dashboard/ciso" },
];

function Overview() {
  const { sessionChecks, sessionReceipts, activePolicyIds, customPolicies } = useDemoStore();
  const activePolicies = activePolicyIds
    .map((id) => policyById(id, customPolicies))
    .filter((policy): policy is PolicyDefinition => Boolean(policy));
  const customCount = activePolicies.filter((policy) => policy.custom).length;

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="JurisCore"
        icon={<LayoutDashboard className="h-6 w-6" aria-hidden />}
        title="Protect the prompt. Prove the answer."
        description="Every check returns allow, revise, or block — with findings, policy versions, and a receipt."
        actions={
          <>
            <Button asChild>
              <Link to="/dashboard/redaction">
                <EyeOff className="mr-2 h-4 w-4" aria-hidden /> Open Veil
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/drift">
                <GitPullRequest className="mr-2 h-4 w-4" aria-hidden /> Open Plumb
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Session activity" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Session activity</h2>
          <Badge variant="outline">This session · live</Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ModuleActivityCard
            module="veil"
            label="Veil"
            icon={<EyeOff className="h-4 w-4 text-primary" aria-hidden />}
            checks={sessionChecks.veil}
            to="/dashboard/redaction"
          />
          <ModuleActivityCard
            module="plumb"
            label="Plumb"
            icon={<GitPullRequest className="h-4 w-4 text-primary" aria-hidden />}
            checks={sessionChecks.plumb}
            to="/dashboard/drift"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Counts from checks run in this browser session; cleared by Reset demo and page reload.
        </p>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden />
              Policy posture
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/rulebooks">Manage policies</Link>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {activePolicies.length} active {activePolicies.length === 1 ? "policy" : "policies"}
            {customCount > 0 ? ` · ${customCount} custom` : ""} — applied to every Veil and Plumb
            check and recorded in each receipt.
          </p>
          <div className="flex flex-wrap gap-2">
            {activePolicies.map((policy) => (
              <Badge key={policy.id} variant="outline">
                {policy.shortName} · {policy.version}
              </Badge>
            ))}
            {activePolicies.length === 0 && (
              <Badge variant="outline" className="text-[color:var(--revise)]">
                No policy active
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" aria-hidden />
              Receipts this session
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/audit">View receipts</Link>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessionReceipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Receipts appear here after you download one from a check.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sessionReceipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-mono text-xs">{receipt.id}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {receipt.module}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={verdictColor[receipt.verdict as keyof typeof verdictColor] ?? ""}
                    >
                      {receipt.verdict.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {receipt.createdAt.slice(11, 19)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-label="Simulated demonstrations" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Simulated demonstrations
        </span>
        {DEMO_LINKS.map((demo) => (
          <Link
            key={demo.to}
            to={demo.to}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {demo.label} <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        ))}
      </section>
    </div>
  );
}

function ModuleActivityCard({
  module,
  label,
  icon,
  checks,
  to,
}: {
  module: ValidationModule;
  label: string;
  icon: ReactNode;
  checks: SessionModuleChecks;
  to: string;
}) {
  const total = checks.allow + checks.revise + checks.block;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No {label} checks yet this session.{" "}
            <Link to={to} className="text-primary hover:underline">
              Run one
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-mono text-4xl font-semibold">{total}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {total === 1 ? "Check" : "Checks"} this session
              </div>
            </div>
            <dl className="flex gap-4 text-sm">
              <VerdictCell label="Allow" value={checks.allow} tone="allow" />
              <VerdictCell label="Revise" value={checks.revise} tone="revise" />
              <VerdictCell label="Block" value={checks.block} tone="block" />
            </dl>
            {checks.lastVerdict && checks.lastAt && (
              <div className="basis-full text-xs text-muted-foreground">
                Last check:{" "}
                <Badge variant="outline" className={verdictColor[checks.lastVerdict]}>
                  {checks.lastVerdict.toUpperCase()}
                </Badge>{" "}
                at <span className="font-mono">{checks.lastAt.slice(11, 19)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const toneText = {
  allow: "text-[color:var(--allow)]",
  revise: "text-[color:var(--revise)]",
  block: "text-[color:var(--block)]",
};

function VerdictCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "allow" | "revise" | "block";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-xl font-semibold ${toneText[tone]}`}>{value}</dd>
    </div>
  );
}
