import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, EyeOff, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { protectText, type VeilProfile, type VeilStrategy } from "@/lib/juriscore/veil/engine";

export const Route = createFileRoute("/dashboard/redaction")({
  head: () => ({
    meta: [
      { title: "JurisCore Veil — Privacy Workbench" },
      {
        name: "description",
        content: "Protect sensitive healthcare information before it reaches an AI model.",
      },
    ],
  }),
  component: VeilWorkbench,
});

const SYNTHETIC_SAMPLE = `Synthetic training example — not a real patient

Patient: Maya Patel
DOB: 04/12/1982
MRN: 88742199
Member ID: HMO-44912003
Email: maya.patel@example.test
Phone: 415-555-0199

Clinical context: Type 2 diabetes follow-up. Medication adherence was discussed and the patient reported no new adverse effects. Prepare a concise care-team handoff.`;

const verdictClass = {
  allow: "border-[color:var(--allow)]/40 text-[color:var(--allow)]",
  revise: "border-[color:var(--revise)]/40 text-[color:var(--revise)]",
  block: "border-[color:var(--block)]/40 text-[color:var(--block)]",
};

function VeilWorkbench() {
  const [raw, setRaw] = useState(SYNTHETIC_SAMPLE);
  const [strategy, setStrategy] = useState<VeilStrategy>("redact");
  const [profile, setProfile] = useState<VeilProfile>("healthcare");
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => protectText(raw, { strategy, profile }), [profile, raw, strategy]);

  const copySanitized = async () => {
    await navigator.clipboard.writeText(result.sanitizedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="JurisCore Veil"
        icon={<EyeOff className="h-6 w-6" aria-hidden />}
        title="Protect the prompt"
        description="Detect and transform configured sensitive information before content reaches an AI model. The clinical context remains visible while selected identifiers are removed or tokenized."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={profile} onValueChange={(value) => setProfile(value as VeilProfile)}>
          <SelectTrigger className="w-48" aria-label="Protection profile">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="healthcare">Healthcare privacy</SelectItem>
            <SelectItem value="all_sensitive">All sensitive data</SelectItem>
          </SelectContent>
        </Select>
        <Tabs value={strategy} onValueChange={(value) => setStrategy(value as VeilStrategy)}>
          <TabsList>
            <TabsTrigger value="redact">Redact</TabsTrigger>
            <TabsTrigger value="tokenize">Tokenize</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="min-w-0 overflow-hidden border-[color:var(--revise)]/30 bg-[color:var(--revise)]/[0.04]">
        <CardContent className="pt-5 flex items-start gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--revise)]" aria-hidden />
          <div className="min-w-0">
            <div className="font-medium">Transparent prototype boundary</div>
            <p className="mt-1 text-muted-foreground">
              This workbench uses visible deterministic detectors and synthetic text. It
              demonstrates a guardrail workflow; it does not establish complete de-identification or
              regulatory compliance.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 lg:grid-cols-2 gap-4">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between gap-3">
              <span>Original input</span>
              <Badge variant="outline" className={verdictClass[result.rawVerdict]}>
                {result.rawVerdict.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label htmlFor="veil-raw" className="sr-only">
              Original input
            </label>
            <Textarea
              id="veil-raw"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={16}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[color:var(--allow)]" aria-hidden />
                Permitted model input
              </span>
              <span className="flex items-center gap-2">
                <Badge variant="outline" className={verdictClass[result.sanitizedVerdict]}>
                  {result.sanitizedVerdict.toUpperCase()}
                </Badge>
                <Button size="sm" variant="outline" onClick={copySanitized}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              aria-label="Sanitized output"
              className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap min-h-[24rem] overflow-auto"
            >
              {result.sanitizedText
                .split(/(\[(?:REDACTED_)?[A-Z_]+(?:_\d+)?\])/g)
                .map((chunk, index) =>
                  /^\[/.test(chunk) ? (
                    <span
                      key={`${chunk}-${index}`}
                      className="inline-block px-1 rounded bg-[color:var(--block)]/15 text-[color:var(--block)]"
                    >
                      {chunk}
                    </span>
                  ) : (
                    <span key={`text-${index}`}>{chunk}</span>
                  ),
                )}
            </pre>
            {result.requiresReview && (
              <p className="mt-3 text-xs text-muted-foreground">
                Review required before sending: {result.findings.length} detector categories
                transformed.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Transformation receipt</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" aria-label="Veil findings">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Detector
                </th>
                <th scope="col" className="text-right px-4 py-2 font-medium">
                  Count
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Severity
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Replacement
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Raw value
                </th>
              </tr>
            </thead>
            <tbody>
              {result.findings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No configured sensitive category was detected.
                  </td>
                </tr>
              ) : (
                result.findings.map((finding) => (
                  <tr key={finding.id} className="border-t border-border/60">
                    <td className="px-4 py-2">
                      <div>{finding.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {finding.detectorId}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{finding.count}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={
                          finding.severity === "high"
                            ? "border-[color:var(--block)]/40 text-[color:var(--block)]"
                            : "border-[color:var(--revise)]/40 text-[color:var(--revise)]"
                        }
                      >
                        {finding.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {[...new Set(finding.replacements)].join(", ")}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">Not retained in finding</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
