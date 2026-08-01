import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import {
  BookOpen,
  EyeOff,
  GitPullRequest,
  LayoutDashboard,
  ReceiptText,
} from "lucide-react";
import {
  SIMULATED_SEED,
  summarizeTrailingWeek,
  useDemoStore,
} from "@/lib/juriscore/demo-store";
import { policyById, type PolicyDefinition } from "@/lib/juriscore/policies/catalog";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Overview — JurisCore" },
      {
        name: "description",
        content:
          "Weekly Veil and Plumb activity on this device, active policies, and receipts.",
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

const toneText = {
  allow: "text-[color:var(--allow)]",
  revise: "text-[color:var(--revise)]",
  block: "text-[color:var(--block)]",
};

function formatVolume(chars: number) {
  if (chars < 1024 * 1024) return `${Math.max(1, Math.round(chars / 1024))} KB`;
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
}

function Overview() {
  const { localMetrics, sessionReceipts, activePolicyIds, customPolicies, seedDemoMetrics } =
    useDemoStore();
  const activePolicies = activePolicyIds
    .map((id) => policyById(id, customPolicies))
    .filter((policy): policy is PolicyDefinition => Boolean(policy));
  const customCount = activePolicies.filter((policy) => policy.custom).length;

  const simulated = localMetrics.simulated;
  const live = useMemo(() => summarizeTrailingWeek(localMetrics), [localMetrics]);

  const overall = simulated
    ? SIMULATED_SEED.overall
    : {
        checks: live.veil.checks + live.plumb.checks,
        allow: live.veil.allow + live.plumb.allow,
        revise: live.veil.revise + live.plumb.revise,
        block: live.veil.block + live.plumb.block,
        receipts: live.receipts,
      };
  const veil = simulated ? SIMULATED_SEED.veil : live.veil;
  const plumb = simulated ? SIMULATED_SEED.plumb : live.plumb;
  const isEmpty = !simulated && overall.checks === 0 && overall.receipts === 0;

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

      <section aria-label="Weekly metrics" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">This week</h2>
          <Badge
            variant="outline"
            className={simulated ? "text-[color:var(--revise)]" : undefined}
          >
            {simulated ? "Simulated" : "Last 7 days · this device · live"}
          </Badge>
        </div>

        {isEmpty ? (
          <Card>
            <CardContent className="space-y-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No checks recorded on this device yet.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild size="sm">
                  <Link to="/dashboard/redaction">Run a Veil check</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/dashboard/drift">Run a Plumb check</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={seedDemoMetrics}>
                  Populate simulated demo metrics
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <MetricTile title="Overall" simulated={simulated}>
              <BigStat value={overall.checks} label="Checks run" />
              <dl className="flex gap-4 text-sm">
                <VerdictCell label="Allow" value={overall.allow} tone="allow" />
                <VerdictCell label="Revise" value={overall.revise} tone="revise" />
                <VerdictCell label="Block" value={overall.block} tone="block" />
              </dl>
              <SmallStat value={overall.receipts.toLocaleString("en-US")} label="Receipts downloaded" />
            </MetricTile>

            <MetricTile
              title="Veil"
              icon={<EyeOff className="h-4 w-4 text-primary" aria-hidden />}
              simulated={simulated}
            >
              <BigStat value={veil.checks} label="Documents and prompts protected" />
              <SmallStat
                value={veil.occurrences.toLocaleString("en-US")}
                label={`Sensitive occurrences protected (${veil.redacted.toLocaleString("en-US")} redacted · ${veil.tokenized.toLocaleString("en-US")} tokenized)`}
              />
              <SmallStat value={formatVolume(veil.chars)} label="Input volume processed" />
            </MetricTile>

            <MetricTile
              title="Plumb"
              icon={<GitPullRequest className="h-4 w-4 text-primary" aria-hidden />}
              simulated={simulated}
            >
              <BigStat value={plumb.checks} label="Checks run" />
              <SmallStat
                value={plumb.assertions.toLocaleString("en-US")}
                label="Assertions checked"
              />
              <dl className="flex gap-4 text-sm">
                <VerdictCell label="Drifted" value={plumb.drifted} tone="block" />
                <VerdictCell label="Cannot determine" value={plumb.cannotDetermine} tone="revise" />
              </dl>
            </MetricTile>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {simulated
            ? "Simulated demonstration data — not measurements. The first real check replaces it with live counts."
            : "Counts from checks run on this device in the last 7 days. Cleared by Reset demo."}
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
    </div>
  );
}

function MetricTile({
  title,
  icon,
  simulated,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  simulated: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          {simulated && (
            <Badge variant="outline" className="text-[10px] text-[color:var(--revise)]">
              Simulated
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function BigStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-mono text-4xl font-semibold">{value.toLocaleString("en-US")}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function SmallStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

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
      <dd className={`font-mono text-xl font-semibold ${toneText[tone]}`}>
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}
