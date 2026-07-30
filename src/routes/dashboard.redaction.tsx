import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EyeOff, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/dashboard/redaction")({
  head: () => ({
    meta: [
      { title: "Redaction Sandbox — JurisCore AI" },
      { name: "description", content: "Live demonstration of the secret-scrubbing input guardrail." },
    ],
  }),
  component: Redaction,
});

interface Finding { type: string; count: number; severity: "high" | "medium"; ruleId: string; }

const PATTERNS: Array<{ rx: RegExp; tag: string; type: string; severity: Finding["severity"]; ruleId: string }> = [
  { rx: /AKIA[0-9A-Z]{16}/g, tag: "[REDACTED_AWS_KEY]", type: "AWS access key", severity: "high", ruleId: "SEC-T42" },
  { rx: /postgres:\/\/[^\s"']+/g, tag: "[REDACTED_DB_URL]", type: "Database URL", severity: "high", ruleId: "SEC-T42" },
  { rx: /\b\d{3}-\d{2}-\d{4}\b/g, tag: "[REDACTED_SSN]", type: "SSN", severity: "high", ruleId: "HIPAA-164.514" },
  { rx: /\b(?:\d[ -]*?){13,16}\b/g, tag: "[REDACTED_PAN]", type: "Payment card (PAN)", severity: "high", ruleId: "AML-K3" },
  { rx: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, tag: "[REDACTED_EMAIL]", type: "Email address", severity: "medium", ruleId: "GDPR-6" },
  { rx: /\bMRN[:\s]*\d{4,}\b/gi, tag: "[REDACTED_MRN]", type: "Patient MRN", severity: "high", ruleId: "HIPAA-164.502" },
  { rx: /sk-[A-Za-z0-9]{20,}/g, tag: "[REDACTED_API_KEY]", type: "Bearer / API key", severity: "high", ruleId: "SEC-T42" },
];

const SAMPLE = `From: alex@acme-health.com
Hey team — quick debug ask. Prod is throwing 500s again.

Repro creds (please rotate after):
  AWS: AKIAIOSFODNN7EXAMPLE
  DB:  postgres://svc_user:hunter2@prod-db-01.internal:5432/patients
  OpenAI: sk-proj-9J7dqW2mVzxYqPmXn1ZbTkFhLoAaBbCcDdEeFfGg

Ticket is for patient MRN 88742199. Their SSN 123-45-6789 shows up
in two rows and card 4111 1111 1111 1111 was declined. Escalate to
compliance@acme-health.com if you can't repro.`;

function redact(text: string): { output: string; findings: Finding[] } {
  let output = text;
  const findings: Finding[] = [];
  for (const p of PATTERNS) {
    const matches = text.match(p.rx);
    if (matches && matches.length) {
      findings.push({ type: p.type, count: matches.length, severity: p.severity, ruleId: p.ruleId });
      output = output.replace(p.rx, p.tag);
    }
  }
  return { output, findings };
}

function Redaction() {
  const [raw, setRaw] = useState(SAMPLE);
  const { output, findings } = useMemo(() => redact(raw), [raw]);
  const totalHigh = findings.filter((f) => f.severity === "high").reduce((s, f) => s + f.count, 0);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Try it live"
        icon={<EyeOff className="h-6 w-6" aria-hidden />}
        title="Private-data scrubber"
        description="Paste anything with a name, SSN, credit card, or API key. Watch JurisCore rewrite it before it ever reaches the AI."
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>What was sent</span>
              <Badge variant="outline" className="border-[color:var(--block)]/40 text-[color:var(--block)]">{totalHigh} high-risk items found</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label htmlFor="raw" className="sr-only">Raw text</label>
            <Textarea id="raw" value={raw} onChange={(e) => setRaw(e.target.value)} rows={14} className="font-mono text-xs" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[color:var(--allow)]" aria-hidden /> What the AI actually sees</span>
              <Badge variant="outline" className="border-[color:var(--allow)]/40 text-[color:var(--allow)]">Safe to send</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre aria-label="Sanitized output" className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap min-h-[calc(14*1.5rem)] overflow-auto">
              {output.split(/(\[REDACTED_[A-Z_]+\])/g).map((chunk, i) =>
                /^\[REDACTED_/.test(chunk)
                  ? <span key={i} className="inline-block px-1 rounded bg-[color:var(--block)]/20 text-[color:var(--block)]">{chunk}</span>
                  : <span key={i}>{chunk}</span>
              )}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">What we removed</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" aria-label="Redaction findings">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="text-left px-4 py-2 font-medium">Type</th>
                <th scope="col" className="text-right px-4 py-2 font-medium">Count</th>
                <th scope="col" className="text-left px-4 py-2 font-medium">Severity</th>
                <th scope="col" className="text-left px-4 py-2 font-medium">Rule ID</th>
              </tr>
            </thead>
            <tbody>
              {findings.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No secrets detected. Payload is safe.</td></tr>
              ) : findings.map((f) => (
                <tr key={f.type} className="border-t border-border/60">
                  <td className="px-4 py-2">{f.type}</td>
                  <td className="px-4 py-2 text-right font-mono">{f.count}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={f.severity === "high" ? "border-[color:var(--block)]/40 text-[color:var(--block)]" : "border-[color:var(--revise)]/40 text-[color:var(--revise)]"}>{f.severity}</Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-primary">{f.ruleId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
