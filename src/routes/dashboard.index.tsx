import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { BookOpen, EyeOff, GitPullRequest, LayoutDashboard, ReceiptText } from "lucide-react";
import { SIMULATED_SEED, summarizeTrailingWeek, useDemoStore } from "@/lib/juriscore/demo-store";
import type { DriftRiskBand } from "@/lib/juriscore/core/contracts";
import type { PredictionKind, PredictionRecord } from "@/lib/juriscore/metrics-ledger";
import { policyById, type PolicyDefinition } from "@/lib/juriscore/policies/catalog";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Overview — JurisCore" },
      {
        name: "description",
        content: "Weekly Veil and Plumb activity on this device, active policies, and receipts.",
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

const RISK_TONE = { low: "allow", uncertain: "revise", high: "block" } as const;

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
  const { localMetrics, recentReceipts, activePolicyIds, customPolicies, seedDemoMetrics } =
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
  const plumbRisk = simulated ? SIMULATED_SEED.plumbRisk.counts : live.plumb.risk;
  const veilOutcomes = simulated
    ? SIMULATED_SEED.veilOutcomes
    : { allow: live.veil.allow, revise: live.veil.revise, block: live.veil.block };
  const plumbOutcomes = simulated
    ? SIMULATED_SEED.plumbOutcomes
    : { allow: live.plumb.allow, revise: live.plumb.revise, block: live.plumb.block };
  const recent = simulated ? [] : localMetrics.recentPredictions;
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
          <Badge variant="outline" className={simulated ? "text-[color:var(--revise)]" : undefined}>
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
          <div className="grid gap-4">
            <MetricTile title="Overall" simulated={simulated}>
              <BigStat value={overall.checks} label="Checks run" />
              <dl className="flex gap-4 text-sm">
                <VerdictCell label="Allow" value={overall.allow} tone="allow" />
                <VerdictCell label="Revise" value={overall.revise} tone="revise" />
                <VerdictCell label="Block" value={overall.block} tone="block" />
              </dl>
              <SmallStat
                value={overall.receipts.toLocaleString("en-US")}
                label="Receipts recorded"
              />
            </MetricTile>
          </div>
        )}

        {!isEmpty && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ToolCard
              title="Veil"
              icon={<EyeOff className="h-4 w-4 text-primary" aria-hidden />}
              simulated={simulated}
              checks={veil.checks}
              checksLabel="prompts and documents checked"
              outcomes={[
                { label: "No sensitive data", value: veilOutcomes.allow, tone: "allow" },
                { label: "Sensitive data protected", value: veilOutcomes.revise, tone: "revise" },
                { label: "High-risk data found", value: veilOutcomes.block, tone: "block" },
              ]}
              details={
                <>
                  <SmallStat
                    value={veil.occurrences.toLocaleString("en-US")}
                    label={`Sensitive occurrences protected (${veil.redacted.toLocaleString("en-US")} redacted · ${veil.tokenized.toLocaleString("en-US")} tokenized)`}
                  />
                  <SmallStat value={formatVolume(veil.chars)} label="Input volume processed" />
                </>
              }
              predictive={
                <PredictiveSlice
                  title="Residual exposure"
                  question="How likely is it that text Veil already cleaned still holds something sensitive?"
                  latest={latestOf(recent, "residual-exposure")}
                  bands={bandsOf(historyOf(recent, "residual-exposure"))}
                  bandsLabel="Recent runs by band"
                  history={historyOf(recent, "residual-exposure")}
                  emptyText="No residual-exposure predictions yet. The Veil predictor is in final review; its scores appear here once it ships."
                />
              }
            />

            <ToolCard
              title="Plumb"
              icon={<GitPullRequest className="h-4 w-4 text-primary" aria-hidden />}
              simulated={simulated}
              checks={plumb.checks}
              checksLabel="docs-vs-code checks run"
              outcomes={[
                { label: "All claims matched", value: plumbOutcomes.allow, tone: "allow" },
                { label: "Found drift", value: plumbOutcomes.block, tone: "block" },
                {
                  label: "Couldn't determine",
                  value: plumbOutcomes.revise,
                  tone: "revise",
                  hint: "A claim couldn't be confirmed or refuted, nothing matched a known subject, or no policy was active.",
                },
              ]}
              details={
                <div>
                  <div className="font-mono text-xl font-semibold">
                    {plumb.assertions.toLocaleString("en-US")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Claims compared — each is one statement, such as &ldquo;KYC applies above
                    $10,000&rdquo;, checked in both the code and a document (
                    {plumb.drifted.toLocaleString("en-US")} drifted ·{" "}
                    {plumb.cannotDetermine.toLocaleString("en-US")} undetermined)
                  </div>
                </div>
              }
              predictive={
                <PredictiveSlice
                  title="Drift risk"
                  question="How likely is it that a code change needs a docs update?"
                  latest={
                    simulated
                      ? {
                          score: SIMULATED_SEED.plumbRisk.latest.score,
                          band: SIMULATED_SEED.plumbRisk.latest.band,
                          at: null,
                        }
                      : (latestOf(recent, "drift-risk") ??
                        (localMetrics.latestRisk ? { ...localMetrics.latestRisk } : null))
                  }
                  bands={plumbRisk}
                  history={historyOf(recent, "drift-risk")}
                  emptyText="No scored change yet. Connect a pull request or paste a diff in Plumb and run a check."
                />
              }
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {simulated
            ? "Simulated demonstration data — not measurements. The first real check replaces it with live counts."
            : "Counts from checks run on this device in the last 7 days."}
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
              Latest receipts
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/audit">View receipts</Link>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentReceipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Receipts appear here after a Plumb check, or when you copy, save, or download a Veil
              result.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {recentReceipts.map((receipt) => (
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

type Tone = "allow" | "revise" | "block";

interface LatestPrediction {
  score: number;
  band: DriftRiskBand;
  at: string | null;
}

function latestOf(recent: PredictionRecord[], kind: PredictionKind): LatestPrediction | null {
  const entry = recent.find((prediction) => prediction.kind === kind);
  return entry ? { score: entry.score, band: entry.band, at: entry.at } : null;
}

/** Band mix of the recent runs (up to the history cap), or nothing before the first run. */
function bandsOf(history: PredictionRecord[]) {
  if (history.length === 0) return undefined;
  const counts: Record<DriftRiskBand, number> = { low: 0, uncertain: 0, high: 0 };
  for (const run of history) counts[run.band] += 1;
  return counts;
}

/** Oldest first, for drawing left to right. */
function historyOf(recent: PredictionRecord[], kind: PredictionKind) {
  return recent.filter((prediction) => prediction.kind === kind).reverse();
}

function formatWhen(at: string) {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One tool's week on this device: how many checks ran, what each check concluded (every
 * outcome is a share of those checks), the supporting detail, then its predictive slice.
 */
function ToolCard({
  title,
  icon,
  simulated,
  checks,
  checksLabel,
  outcomes,
  details,
  predictive,
}: {
  title: string;
  icon: ReactNode;
  simulated: boolean;
  checks: number;
  checksLabel: string;
  outcomes: Array<{ label: string; value: number; tone: Tone; hint?: string }>;
  details: ReactNode;
  predictive: ReactNode;
}) {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.value, 0);
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
      <CardContent className="space-y-5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-4xl font-semibold">{checks.toLocaleString("en-US")}</span>
          <span className="text-sm text-muted-foreground">{checksLabel} on this device</span>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            What those checks found
          </div>
          {total > 0 ? (
            <div
              className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={outcomes
                .map((outcome) => `${outcome.label}: ${outcome.value} of ${total}`)
                .join(", ")}
            >
              {outcomes
                .filter((outcome) => outcome.value > 0)
                .map((outcome) => (
                  <div
                    key={outcome.label}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(outcome.value / total) * 100}%`,
                      background: `var(--${outcome.tone})`,
                    }}
                    title={`${outcome.label}: ${outcome.value} of ${total}`}
                  />
                ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No checks in the last 7 days.</p>
          )}
          <dl className="grid gap-1.5 text-sm">
            {outcomes.map((outcome) => (
              <div key={outcome.label} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2" title={outcome.hint}>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: `var(--${outcome.tone})` }}
                    aria-hidden
                  />
                  {outcome.label}
                  {outcome.hint && (
                    <span className="text-[10px] text-muted-foreground" aria-hidden>
                      ⓘ
                    </span>
                  )}
                </dt>
                <dd className="font-mono tabular-nums">
                  {outcome.value.toLocaleString("en-US")}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {total > 0 ? `${Math.round((outcome.value / total) * 100)}%` : "—"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-3">{details}</div>

        <div className="border-t border-border pt-4">{predictive}</div>
      </CardContent>
    </Card>
  );
}

/** The predictive slice of a tool card: latest score, band mix, and recent runs. */
function PredictiveSlice({
  title,
  question,
  latest,
  bands,
  bandsLabel = "Last 7 days by band",
  history,
  emptyText,
}: {
  title: string;
  question: string;
  latest: LatestPrediction | null;
  bands?: Record<DriftRiskBand, number>;
  bandsLabel?: string;
  history: PredictionRecord[];
  emptyText: string;
}) {
  const recentRuns = [...history].reverse().slice(0, 5);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Predictive · {title}
        </div>
        <Badge variant="outline" className="text-[10px] text-[color:var(--revise)]">
          Advisory · placeholder weights
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{question}</p>
      {latest ? (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold">{latest.score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
          <Badge variant="outline" className={`capitalize ${verdictColor[RISK_TONE[latest.band]]}`}>
            {latest.band}
          </Badge>
          <span className="text-xs text-muted-foreground">
            latest{latest.at ? ` · ${formatWhen(latest.at)}` : ""}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
      {bands && (
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {bandsLabel}
        </div>
      )}
      {bands && (
        <dl className="flex gap-4 text-sm">
          <VerdictCell label="Low" value={bands.low} tone="allow" />
          <VerdictCell label="Uncertain" value={bands.uncertain} tone="revise" />
          <VerdictCell label="High" value={bands.high} tone="block" />
        </dl>
      )}
      {history.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Recent runs on this device
          </div>
          <Sparkline history={history} />
          <table className="w-full text-xs">
            <caption className="sr-only">Most recent {title.toLowerCase()} predictions</caption>
            <thead className="text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 font-normal">
                  When
                </th>
                <th scope="col" className="py-1 font-normal">
                  Score
                </th>
                <th scope="col" className="py-1 font-normal">
                  Band
                </th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={`${run.at}-${run.sequence}`} className="border-t border-border/60">
                  <td className="py-1">{formatWhen(run.at)}</td>
                  <td className="py-1 font-mono tabular-nums">{run.score}</td>
                  <td className={`py-1 capitalize ${toneText[RISK_TONE[run.band]]}`}>{run.band}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Scores of the recent runs, oldest to newest, against the band thresholds (35 and 65).
 * One series, so the section heading names it; each point carries its own tooltip.
 */
function Sparkline({ history }: { history: PredictionRecord[] }) {
  const width = 240;
  const height = 48;
  const pad = 5;
  const x = (index: number) =>
    history.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (history.length - 1);
  const y = (score: number) => pad + ((100 - score) * (height - pad * 2)) / 100;
  const points = history.map((run, index) => `${x(index)},${y(run.score)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-12 w-full text-muted-foreground"
      role="img"
      aria-label={`Scores of the last ${history.length} runs, oldest to newest: ${history
        .map((run) => run.score)
        .join(", ")}`}
      preserveAspectRatio="none"
    >
      {[35, 65].map((threshold) => (
        <line
          key={threshold}
          x1={0}
          x2={width}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {history.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {history.map((run, index) => (
        <circle
          key={`${run.at}-${run.sequence}`}
          cx={x(index)}
          cy={y(run.score)}
          r={3.5}
          fill={`var(--${RISK_TONE[run.band]})`}
          stroke="var(--card)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        >
          <title>{`${formatWhen(run.at)} · ${run.score} (${run.band})`}</title>
        </circle>
      ))}
    </svg>
  );
}

function MetricTile({
  title,
  icon,
  simulated,
  children,
}: {
  title: string;
  icon?: ReactNode;
  simulated: boolean;
  children: ReactNode;
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
