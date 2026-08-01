import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  EyeOff,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  ReceiptText,
  Send,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import { createReceipt, downloadReceipt } from "@/lib/juriscore/core/receipts";
import { veilReceiptInput } from "@/lib/juriscore/veil/receipt";
import type { ValidationReceipt } from "@/lib/juriscore/core/contracts";
import { ReceiptSummary } from "@/components/receipt-summary";
import {
  policiesForFeature,
  veilScopesForPolicies,
} from "@/lib/juriscore/policies/catalog";
import { protectText, type VeilStrategy } from "@/lib/juriscore/veil/engine";
import {
  ACCEPTED_DOCUMENT_TYPES,
  extractDocumentText,
  validateDocument,
  type ExtractionProgress,
  type SupportedDocumentKind,
} from "@/lib/juriscore/veil/document-extraction";

export const Route = createFileRoute("/dashboard/redaction")({
  head: () => ({
    meta: [
      { title: "JurisCore Veil — Privacy Workbench" },
      {
        name: "description",
        content: "Protect customer, operational, and security data before it reaches an AI model.",
      },
    ],
  }),
  component: VeilWorkbench,
});

const SYNTHETIC_SAMPLE = `Synthetic SaaS support incident — no real customer data

Workspace ID: acme-prod-4831
Customer contact: maya.patel@example.test
Phone: 415-555-0199
Database: postgres://support_user:demo-password@db.internal.example/app
Authorization: Bearer demoToken_92JkLm4NpQr7StUvWxYz

Incident context: Exports started timing out after release 7.4. The customer reproduced the issue twice in the same workspace. Summarize the failure pattern for an engineering handoff without exposing customer identity or credentials.`;

const verdictClass = {
  allow: "border-[color:var(--allow)]/40 text-[color:var(--allow)]",
  revise: "border-[color:var(--revise)]/40 text-[color:var(--revise)]",
  block: "border-[color:var(--block)]/40 text-[color:var(--block)]",
};

type UploadedDocument = {
  fileName: string;
  fileSize: number;
  kind: SupportedDocumentKind;
  pageCount?: number;
  previewUrl?: string;
  warnings: string[];
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function VeilWorkbench() {
  const { activePolicyIds, customPolicies, recordVeilCheck, recordReceipt } = useDemoStore();
  const [raw, setRaw] = useState(SYNTHETIC_SAMPLE);
  const [strategy, setStrategy] = useState<VeilStrategy>("redact");
  const [copied, setCopied] = useState(false);
  const [uploadedDocument, setUploadedDocument] = useState<UploadedDocument | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ValidationReceipt | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const activeVeilPolicies = useMemo(
    () => policiesForFeature(activePolicyIds, "veil", customPolicies),
    [activePolicyIds, customPolicies],
  );
  const policyScopes = useMemo(
    () => veilScopesForPolicies(activePolicyIds, customPolicies),
    [activePolicyIds, customPolicies],
  );
  const result = useMemo(
    () =>
      protectText(raw, {
        strategy,
        profile: "all_sensitive",
        policyIds: activeVeilPolicies.map((policy) => policy.id),
        policyScopes,
      }),
    [activeVeilPolicies, policyScopes, raw, strategy],
  );

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    setReceipt(null);
    setReceiptError(null);
  }, [raw, strategy, activeVeilPolicies, policyScopes]);

  const releasePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const processDocument = async (file: File) => {
    setUploadError(null);
    setProgress({ label: "Validating document", percent: 1 });

    try {
      const kind = validateDocument(file);
      releasePreview();
      const previewUrl = kind === "pdf" || kind === "png" ? URL.createObjectURL(file) : undefined;
      previewUrlRef.current = previewUrl ?? null;
      setUploadedDocument({
        fileName: file.name,
        fileSize: file.size,
        kind,
        previewUrl,
        warnings: [],
      });
      setRaw("");

      const extracted = await extractDocumentText(file, setProgress);
      setRaw(extracted.text);
      setUploadedDocument((current) =>
        current
          ? {
              ...current,
              pageCount: extracted.pageCount,
              warnings: extracted.warnings,
            }
          : current,
      );
      setProgress({ label: "Document ready for Veil", percent: 100 });
      window.setTimeout(() => setProgress(null), 1200);
    } catch (error) {
      setProgress(null);
      setUploadError(error instanceof Error ? error.message : "The document could not be read.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearDocument = () => {
    releasePreview();
    setUploadedDocument(null);
    setUploadError(null);
    setProgress(null);
    setRaw("");
  };

  const loadSample = () => {
    releasePreview();
    setUploadedDocument(null);
    setUploadError(null);
    setProgress(null);
    setRaw(SYNTHETIC_SAMPLE);
  };

  const recordCurrentRun = () => {
    const occurrences = result.findings.reduce((sum, finding) => sum + finding.count, 0);
    recordVeilCheck({
      verdict: result.rawVerdict,
      occurrences,
      redacted: strategy === "redact" ? occurrences : 0,
      tokenized: strategy === "tokenize" ? occurrences : 0,
      chars: raw.length,
    });
  };

  const copySanitized = async () => {
    await navigator.clipboard.writeText(result.sanitizedText);
    if (raw.trim()) recordCurrentRun();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const generateReceipt = async () => {
    try {
      const nextReceipt = await createReceipt(
        veilReceiptInput(
          result,
          raw,
          activeVeilPolicies.map((policy) => ({ id: policy.id, version: policy.version })),
        ),
      );
      setReceipt(nextReceipt);
      setReceiptError(null);
      downloadReceipt(nextReceipt);
      recordCurrentRun();
      recordReceipt({
        id: nextReceipt.id,
        module: nextReceipt.module,
        verdict: nextReceipt.verdict,
        createdAt: nextReceipt.createdAt,
      });
    } catch {
      setReceipt(null);
      setReceiptError("A valid receipt could not be produced for this run.");
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow={<span className="brand-case">JurisCore Veil</span>}
        icon={<EyeOff className="h-6 w-6" aria-hidden />}
        title="Protect the prompt"
        description="Protect customer, operational, and security context before it reaches an AI model. Veil removes or tokenizes selected values while preserving the technical signal needed for support and engineering work."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Applied policies
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeVeilPolicies.map((policy) => (
                <Badge key={policy.id} variant="outline">
                  {policy.shortName} · {policy.version}
                </Badge>
              ))}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/rulebooks">Manage policies</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">Step 1</Badge>
            Upload the original document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_DOCUMENT_TYPES}
            className="sr-only"
            aria-label="Upload a PDF, DOCX, or PNG document"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void processDocument(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void processDocument(file);
            }}
            className={`w-full rounded-lg border-2 border-dashed px-5 py-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/20"
            }`}
          >
            <Upload className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
            <span className="mt-3 block font-medium">Drop a document here or choose a file</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              PDF, DOCX, or PNG · one document · maximum 25 MB
            </span>
          </button>

          {uploadedDocument && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {uploadedDocument.kind === "png" ? (
                  <ImageIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{uploadedDocument.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {uploadedDocument.kind.toUpperCase()} · {formatBytes(uploadedDocument.fileSize)}
                    {uploadedDocument.pageCount
                      ? ` · ${uploadedDocument.pageCount} ${uploadedDocument.pageCount === 1 ? "page" : "pages"}`
                      : ""}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearDocument}
                disabled={Boolean(progress)}
              >
                <X className="mr-1.5 h-4 w-4" aria-hidden />
                Remove
              </Button>
            </div>
          )}

          {progress && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2">
                  {progress.percent < 100 ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileCheck2 className="h-3.5 w-3.5 text-[color:var(--allow)]" aria-hidden />
                  )}
                  {progress.label}
                </span>
                <span className="font-mono">{progress.percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[color:var(--block)]/30 bg-[color:var(--block)]/[0.04] px-4 py-3 text-sm"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--block)]"
                aria-hidden
              />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4" aria-hidden />
              The file is processed in this browser and is not uploaded or retained by JurisCore.
            </span>
            <Button size="sm" variant="ghost" onClick={loadSample}>
              Use synthetic sample instead
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={strategy} onValueChange={(value) => setStrategy(value as VeilStrategy)}>
          <TabsList>
            <TabsTrigger value="redact">Redact</TabsTrigger>
            <TabsTrigger value="tokenize">Tokenize</TabsTrigger>
          </TabsList>
        </Tabs>
        <Badge variant="outline">All sensitive data protected</Badge>
      </div>

      <p className="-mt-4 text-xs text-muted-foreground" aria-live="polite">
        {strategy === "redact"
          ? "Redact for content-only tasks: remove identity and linkability."
          : "Tokenize for relationship-dependent tasks: replace identity with a stable alias."}
      </p>

      <Card className="min-w-0 overflow-hidden border-[color:var(--revise)]/30 bg-[color:var(--revise)]/[0.04]">
        <CardContent className="flex items-start gap-3 pt-4 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[color:var(--revise)]" aria-hidden />
          <p>
            Prototype guardrail: review protected text before model use. Policy packs guide the
            checks; they do not prove complete de-identification, security, or regulatory
            compliance.
          </p>
        </CardContent>
      </Card>

      <div className="grid min-w-0 lg:grid-cols-2 gap-4">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Badge variant="outline">Step 2</Badge>
                Original document
              </span>
              <Badge variant="outline" className={verdictClass[result.rawVerdict]}>
                {result.rawVerdict.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {uploadedDocument?.kind === "pdf" && uploadedDocument.previewUrl && (
              <object
                data={uploadedDocument.previewUrl}
                type="application/pdf"
                aria-label={`Preview of ${uploadedDocument.fileName}`}
                className="h-[28rem] w-full rounded-md border border-border bg-muted/20"
              >
                <p className="p-4 text-sm text-muted-foreground">
                  This browser cannot display the PDF preview. The extracted text is available
                  below.
                </p>
              </object>
            )}
            {uploadedDocument?.kind === "png" && uploadedDocument.previewUrl && (
              <div className="flex max-h-[28rem] justify-center overflow-auto rounded-md border border-border bg-muted/20 p-3">
                <img
                  src={uploadedDocument.previewUrl}
                  alt={`Original uploaded document ${uploadedDocument.fileName}`}
                  className="h-auto max-w-full object-contain"
                />
              </div>
            )}
            {uploadedDocument?.kind === "docx" && (
              <div className="rounded-md border border-border bg-muted/20 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4 text-primary" aria-hidden />
                  Word document content
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  DOCX formatting is normalized into editable text so Veil can inspect every
                  paragraph. The source file remains unchanged.
                </p>
              </div>
            )}
            {uploadedDocument?.warnings.map((warning) => (
              <p key={warning} className="text-xs text-[color:var(--revise)]">
                Extraction note: {warning}
              </p>
            ))}
            <label htmlFor="veil-raw" className="sr-only">
              Extracted original document text
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">
                {uploadedDocument ? "Extracted text · editable" : "Paste text · editable"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {raw.length.toLocaleString("en-US")} characters
              </span>
            </div>
            <Textarea
              id="veil-raw"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={uploadedDocument ? 12 : 16}
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
                <span title="Connect a model in JurisCore before sending protected input.">
                  <Button size="sm" disabled className="gap-1.5">
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Send to AI model
                  </Button>
                </span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="rounded-md border border-border bg-muted/20 px-3 py-2"
              aria-live="polite"
            >
              {progress ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {progress.label}; protection will run automatically
                    </span>
                    <span className="font-mono">{progress.percent}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              ) : raw ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 font-medium text-[color:var(--allow)]">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    {strategy === "redact" ? "Redacted" : "Tokenized"} in real time
                  </span>
                  <span className="text-muted-foreground">
                    Protection runs locally as soon as text is ready.
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Upload a document or enter text to create permitted model input.
                </div>
              )}
            </div>
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
                transformed under {result.policyIds.length} active policies.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-3 text-sm">
            <span>Protection summary</span>
            <Badge variant="outline">This document</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" aria-label="Veil protection summary">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Sensitive information found
                </th>
                <th scope="col" className="text-right px-4 py-2 font-medium">
                  Occurrences
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Action
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {result.findings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No configured sensitive category was detected.
                  </td>
                </tr>
              ) : (
                result.findings.map((finding) => (
                  <tr key={finding.id} className="border-t border-border/60">
                    <td className="px-4 py-2">{finding.label}</td>
                    <td className="px-4 py-2 text-right font-mono">{finding.count}</td>
                    <td className="px-4 py-2 capitalize">{strategy}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {[...new Set(finding.replacements)].join(", ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" aria-hidden />
              Audit receipt
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={generateReceipt}
              disabled={!raw.trim() || Boolean(progress)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Download receipt
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The receipt records the verdict, finding identifiers, and active policy versions for
            this run. It carries a digest of the input — never the text itself — and is generated
            in this browser.
          </p>
          <ReceiptSummary receipt={receipt} error={receiptError} verdictLabel="Raw input verdict" />
        </CardContent>
      </Card>
    </div>
  );
}
