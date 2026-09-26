import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Cpu,
  Download,
  Lock,
  ScrollText,
  Send,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import type { ValidationReceipt, ValidatorVerdict } from "@/lib/juriscore/core/contracts";
import { downloadReceipt } from "@/lib/juriscore/core/receipts";
import {
  BUILT_IN_POLICIES,
  policiesForFeature,
  veilScopesForPolicies,
  type PolicyDefinition,
} from "@/lib/juriscore/policies/catalog";
import { sanitizeForProvider } from "@/lib/juriscore/veil/engine";
import { gatewayModelLabel } from "@/lib/juriscore/gateway/models";
import {
  GatewayHttpError,
  createRunSequencer,
  gatewayClient,
  needsUnlock,
} from "@/lib/juriscore/gateway/client";
import type {
  GatewayCheckSummary,
  GatewayPolicyConfig,
  GatewayRunRecord,
} from "@/lib/juriscore/gateway/protocol";

export const Route = createFileRoute("/dashboard/gateway")({
  head: () => ({
    meta: [
      { title: "LLM Gateway — JurisCore AI" },
      {
        name: "description",
        content:
          "Send a prompt to your connected model through Veil, with a receipt for every run.",
      },
    ],
  }),
  component: Gateway,
});

const PROFILE = "all_sensitive" as const;
const STRATEGY = "redact" as const;

const verdictClass: Record<ValidatorVerdict, string> = {
  allow: "border-[color:var(--allow)]/40 text-[color:var(--allow)]",
  revise: "border-[color:var(--revise)]/40 text-[color:var(--revise)]",
  block: "border-[color:var(--block)]/40 text-[color:var(--block)]",
};

// Only the fields the server's schema accepts: a custom policy is request-scoped there.
function policyForRequest(policy: PolicyDefinition): PolicyDefinition {
  return {
    id: policy.id,
    name: policy.name,
    shortName: policy.shortName,
    version: policy.version,
    authority: policy.authority,
    description: policy.description,
    features: policy.features,
    veilScopes: policy.veilScopes,
    defaultActive: policy.defaultActive,
    ...(policy.custom === undefined ? {} : { custom: policy.custom }),
    source: {
      title: policy.source.title,
      publisher: policy.source.publisher,
      url: policy.source.url,
      retrievedAt: policy.source.retrievedAt,
    },
  };
}

function FindingList({ summary }: { summary: GatewayCheckSummary }) {
  if (summary.findings.length === 0) {
    return <p className="text-xs text-muted-foreground">No sensitive data detected.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {summary.findings.map((finding) => (
        <li key={`${finding.category}-${finding.label}`} className="flex justify-between gap-2">
          <span>{finding.label}</span>
          <span className="font-mono text-muted-foreground">
            {finding.count} · {finding.severity}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface GatewayResult {
  run: GatewayRunRecord;
  output: string | null;
  receipt: ValidationReceipt;
}

function Gateway() {
  const {
    activeModel,
    gateway,
    killSwitch,
    activePolicyIds,
    customPolicies,
    pushRun,
    recentRuns,
    recordReceipt,
    markGatewayLocked,
  } = useDemoStore();
  const [prompt, setPrompt] = useState(
    "Summarize the main risks of sending customer support tickets to an AI model.",
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<GatewayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sequencer = useRef(createRunSequencer());

  const activeVeilPolicies = useMemo(
    () => policiesForFeature(activePolicyIds, "veil", customPolicies),
    [activePolicyIds, customPolicies],
  );
  const policyScopes = useMemo(
    () => veilScopesForPolicies(activePolicyIds, customPolicies),
    [activePolicyIds, customPolicies],
  );
  // Stage 1 preview, in this browser: the same engine and gate the server runs again.
  const preview = useMemo(
    () =>
      sanitizeForProvider(prompt, {
        strategy: STRATEGY,
        profile: PROFILE,
        policyIds: activeVeilPolicies.map((policy) => policy.id),
        policyScopes,
      }),
    [activeVeilPolicies, policyScopes, prompt],
  );

  const status = gateway.phase === "ready" ? gateway.status : null;
  const connection = status?.connections[activeModel];
  const connected = Boolean(status?.configured && connection?.state === "connected");

  let sendBlockedReason: string | null = null;
  if (killSwitch) sendBlockedReason = "Emergency stop is on.";
  else if (gateway.phase === "locked") sendBlockedReason = "Unlock the gateway in the header.";
  else if (!status || !status.configured) sendBlockedReason = "The gateway is not configured.";
  else if (!connected) sendBlockedReason = "Test the connection to the active model first.";
  else if (!prompt.trim()) sendBlockedReason = "Enter a prompt.";

  const send = async () => {
    if (sendBlockedReason || sending) return;
    const policy: GatewayPolicyConfig = {
      builtInIds: activePolicyIds.filter((id) =>
        BUILT_IN_POLICIES.some((builtIn) => builtIn.id === id),
      ),
      custom: customPolicies
        .filter((item) => activePolicyIds.includes(item.id))
        .map(policyForRequest),
      profile: PROFILE,
      strategy: STRATEGY,
    };
    const clientRequestId = sequencer.current.next();
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await gatewayClient.runPrompt({
        purpose: "prompt",
        modelId: activeModel,
        policy,
        prompt,
        clientRequestId,
      });
      // A late answer to an earlier request is discarded, never shown over a newer one.
      if (!sequencer.current.isCurrent(response.run.clientRequestId)) return;
      setResult({ run: response.run, output: response.display.output, receipt: response.receipt });
      // Every completed gateway run stores its full, text-free receipt in the history.
      void recordReceipt(response.receipt).catch(() => undefined);
      pushRun({
        receiptId: response.receipt.id,
        ts: response.receipt.createdAt,
        model: response.run.modelId,
        status: response.run.status,
        verdict: response.receipt.verdict,
        latencyMs: response.run.latencyMs,
      });
    } catch (caught) {
      if (!sequencer.current.isCurrent(clientRequestId)) return;
      if (needsUnlock(caught)) {
        markGatewayLocked((caught as GatewayHttpError).code === "session-expired");
        setError("The gateway session ended. Unlock it again from the header.");
      } else if (caught instanceof GatewayHttpError) {
        setError(caught.message);
      } else {
        setError("The request did not reach the gateway.");
      }
    } finally {
      if (sequencer.current.isCurrent(clientRequestId)) setSending(false);
    }
  };

  // Citation presence only: which active policies the reply names. Not a judgement of
  // whether the reply agrees with them (that is the roadmap semantic judge).
  const output = result?.output ?? null;
  const cited = output
    ? activeVeilPolicies.filter(
        (policy) => output.includes(policy.shortName) || output.includes(policy.id),
      )
    : [];
  const citedNames = cited.map((policy) => policy.shortName).join(", ");

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {!connected && (
        <div
          role="note"
          className="rounded-lg border border-[color:var(--revise)]/30 bg-[color:var(--revise)]/[0.06] px-4 py-3 text-sm"
        >
          <span className="font-medium text-[color:var(--revise)]">No model connected.</span>{" "}
          Nothing on this page leaves your browser until a model passes a live connection check. The
          input scrub below runs locally; no verdict, latency, or token count is shown until a real
          run returns one.
        </div>
      )}

      <PageHeader
        eyebrow="Beta"
        icon={<Zap className="h-6 w-6" aria-hidden />}
        title="Send a prompt through JurisCore"
        description="Veil checks the prompt before it leaves, the connected model answers, and Veil checks the reply on the way back. Every run writes a receipt."
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Your prompt</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {activeModel ? (
                <>
                  Sending to{" "}
                  <span className="font-mono text-foreground">
                    {gatewayModelLabel(activeModel)}
                  </span>{" "}
                  · {connected ? "connected" : "not connected"}
                </>
              ) : (
                "No model selected. Choose one under Active model in the header."
              )}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1 max-w-sm">
            {activeVeilPolicies.map((policy) => (
              <Badge key={policy.id} variant="secondary" className="text-[10px]">
                {policy.shortName}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label htmlFor="gw-prompt" className="sr-only">
            Prompt
          </label>
          <Textarea
            id="gw-prompt"
            rows={4}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={send} disabled={Boolean(sendBlockedReason) || sending}>
              {killSwitch ? (
                <>
                  <Lock className="h-4 w-4 mr-2" /> Emergency stop is on
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />{" "}
                  {sending ? "Sending…" : "Send through JurisCore"}
                </>
              )}
            </Button>
            {sendBlockedReason && (
              <span className="text-xs text-muted-foreground">{sendBlockedReason}</span>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-[color:var(--block)]">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4" aria-live="polite">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" aria-hidden /> 1. Input scrub · Veil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={verdictClass[preview.result.rawVerdict]}>
                Raw input {preview.result.rawVerdict.toUpperCase()}
              </Badge>
              {preview.blocked ? (
                <Badge variant="outline" className={verdictClass.block}>
                  Will not be sent
                </Badge>
              ) : (
                <Badge variant="outline" className={verdictClass.allow}>
                  Safe to send after protection
                </Badge>
              )}
            </div>
            {preview.blocked && <p className="text-xs">{preview.reason}</p>}
            <FindingList
              summary={{
                rawVerdict: preview.result.rawVerdict,
                sanitizedVerdict: preview.result.sanitizedVerdict,
                findings: preview.result.findings.map((finding) => ({
                  category: finding.category,
                  label: finding.label,
                  severity: finding.severity,
                  count: finding.count,
                })),
              }}
            />
            {!preview.blocked && (
              <pre className="max-h-40 overflow-auto rounded-md border border-border bg-muted/20 p-2 text-xs whitespace-pre-wrap">
                {preview.text}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" aria-hidden /> 2. Model call
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {result ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{result.run.status}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {result.run.modelId}
                  </span>
                </div>
                {result.run.reason && <p className="text-xs">{result.run.reason}</p>}
                {result.run.declineCategory && (
                  <p className="text-xs text-muted-foreground">
                    Category: {result.run.declineCategory}
                  </p>
                )}
                {result.run.usage && (
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    <div>
                      <div className="text-muted-foreground">Input tokens</div>
                      <div className="text-base">{result.run.usage.inputTokens}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Output tokens</div>
                      <div className="text-base">{result.run.usage.outputTokens}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground flex items-center gap-1">
                        <Timer className="h-3 w-3" aria-hidden /> Latency
                      </div>
                      <div className="text-base">{result.run.latencyMs} ms</div>
                    </div>
                  </div>
                )}
                {result.output !== null && (
                  <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/20 p-2 text-xs whitespace-pre-wrap">
                    {result.output}
                  </pre>
                )}
                {result.run.status === "truncated" && (
                  <p className="text-xs text-[color:var(--revise)]">
                    The reply hit its length limit and is incomplete.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No run yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> 3. Output check
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {result?.run.outputCheck ? (
              <>
                <Badge
                  variant="outline"
                  className={verdictClass[result.run.outputCheck.rawVerdict]}
                >
                  Reply {result.run.outputCheck.rawVerdict.toUpperCase()}
                </Badge>
                <FindingList summary={result.run.outputCheck} />
                <p className="text-xs text-muted-foreground">
                  {cited.length > 0
                    ? `Mentions active policies: ${citedNames}.`
                    : "The reply cites none of the active policies."}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Runs on the model&apos;s reply, under the same policies as the input.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden /> 4. Semantic judge
              <Badge variant="outline" className="ml-auto text-[10px] uppercase">
                Roadmap
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Checking whether a reply agrees with the policy text it cites is not built yet. No
            result is simulated here.
          </CardContent>
        </Card>
      </div>

      {result && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" aria-hidden /> Receipt
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => downloadReceipt(result.receipt)}>
              <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden /> Download receipt
            </Button>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-2 font-mono text-xs">
            <div className="truncate">id {result.receipt.id}</div>
            <div>
              verdict{" "}
              <Badge variant="outline" className={verdictClass[result.receipt.verdict]}>
                {result.receipt.verdict}
              </Badge>
            </div>
            <div className="truncate">request {result.run.requestDigest.slice(0, 16)}…</div>
            <div className="truncate">
              outbound{" "}
              {result.run.outboundDigest
                ? `${result.run.outboundDigest.slice(0, 16)}…`
                : "nothing sent"}
            </div>
          </CardContent>
        </Card>
      )}

      {recentRuns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {recentRuns.map((run) => (
                <div
                  key={run.receiptId}
                  className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/40 text-xs font-mono"
                >
                  <span className="text-muted-foreground">{run.ts.slice(11, 19)}</span>
                  <span className="w-36 truncate">{gatewayModelLabel(run.model)}</span>
                  <Badge variant="outline" className={`text-[10px] ${verdictClass[run.verdict]}`}>
                    {run.verdict}
                  </Badge>
                  <span className="text-muted-foreground">{run.status}</span>
                  <span className="text-muted-foreground">{run.latencyMs} ms</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card id="setup">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Connect your own Anthropic account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The gateway calls Anthropic with an API key from your own Anthropic Console account. The
            key is set on the server and never reaches this page. Claude Pro and Max subscriptions
            do not include API access.
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              On the server (for local use, in <code>.env.local</code>), set your Anthropic API key,
              turn the gateway on, and choose a gateway access token of 16 characters or more. The
              variable names are in <code>docs/GATEWAY_SETUP.md</code>.
            </li>
            <li>Restart the server.</li>
            <li>Unlock the gateway from the header with the access token.</li>
            <li>Run Test connection. Connected appears only after that check succeeds.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
