import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, FileText, Github, Lock, Trash2, Upload } from "lucide-react";
import type { ConnectedRepository, SourceDocument } from "@/lib/juriscore/demo-store";
import type { PolicyDefinition } from "@/lib/juriscore/policies/catalog";
import {
  parseRepositoryInput,
  parseUnifiedDiff,
  pullRequestDiffUrl,
  type DiffFile,
} from "@/lib/juriscore/plumb/sources";
import {
  ACCEPTED_DOCUMENT_LABEL,
  ACCEPTED_DOCUMENT_TYPES,
  extractDocumentText,
  validateDocument,
} from "@/lib/juriscore/veil/document-extraction";

type RepositoryMode = "paste" | "fetch";

/**
 * Documents are extracted in the browser and their text is kept in local storage, so a
 * batch is bounded rather than unlimited. Five covers the realistic review — a filing, a
 * deck, a policy, a README, release notes — without a single drop stalling the tab on
 * OCR or overflowing the storage quota. Upload again to add more.
 */
const MAX_DOCUMENTS_PER_UPLOAD = 5;

interface PlumbSourcesProps {
  repository: ConnectedRepository | null;
  onRepositoryChange: (repository: ConnectedRepository | null) => void;
  documents: SourceDocument[];
  onDocumentAdd: (document: SourceDocument) => void;
  onDocumentRemove: (id: string) => void;
  onDocumentPolicyChange: (id: string, policyId: string) => void;
  policies: PolicyDefinition[];
  parsedDiff: DiffFile | null;
  /**
   * Hands the parent a way to open the file picker, so the empty state in the document
   * pane starts the same upload rather than duplicating the input.
   */
  registerUploadTrigger?: (open: () => void) => void;
}

export function PlumbSources({
  repository,
  onRepositoryChange,
  documents,
  onDocumentAdd,
  onDocumentRemove,
  onDocumentPolicyChange,
  policies,
  parsedDiff,
  registerUploadTrigger,
}: PlumbSourcesProps) {
  const [repoInput, setRepoInput] = useState(
    repository ? `${repository.owner}/${repository.repo}` : "",
  );
  const [mode, setMode] = useState<RepositoryMode>("paste");
  const [pullNumber, setPullNumber] = useState(repository?.pullNumber?.toString() ?? "");
  const [pastedDiff, setPastedDiff] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentProgress, setDocumentProgress] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reference = parseRepositoryInput(repoInput);

  useEffect(() => {
    registerUploadTrigger?.(() => fileInput.current?.click());
  }, [registerUploadTrigger]);

  const connectPastedDiff = () => {
    setRepoError(null);
    if (!reference) {
      setRepoError("Enter a repository as owner/name or a github.com URL.");
      return;
    }
    if (parseUnifiedDiff(pastedDiff).length === 0) {
      setRepoError("That does not look like a unified diff. Paste the output of git diff.");
      return;
    }
    onRepositoryChange({
      ...reference,
      pullNumber: pullNumber ? Number(pullNumber) : null,
      diff: pastedDiff,
      origin: "pasted",
      loadedAt: new Date().toISOString(),
    });
  };

  const fetchPullRequest = async () => {
    setRepoError(null);
    if (!reference) {
      setRepoError("Enter a repository as owner/name or a github.com URL.");
      return;
    }
    const number = Number(pullNumber);
    if (!Number.isInteger(number) || number <= 0) {
      setRepoError("Enter the pull request number to fetch.");
      return;
    }

    setFetching(true);
    try {
      const response = await fetch(pullRequestDiffUrl(reference, number), {
        headers: { Accept: "application/vnd.github.v3.diff" },
      });
      if (!response.ok) {
        setRepoError(
          response.status === 404
            ? "Not found. Public repositories only — a private repository needs a token JurisCore does not store."
            : `GitHub returned ${response.status}. Unauthenticated requests are rate limited to 60 per hour.`,
        );
        return;
      }
      const diff = await response.text();
      if (parseUnifiedDiff(diff).length === 0) {
        setRepoError("That pull request contains no readable text diff.");
        return;
      }
      onRepositoryChange({
        ...reference,
        pullNumber: number,
        diff,
        origin: "fetched",
        loadedAt: new Date().toISOString(),
      });
    } catch {
      setRepoError("Could not reach github.com. Check the connection, or paste the diff instead.");
    } finally {
      setFetching(false);
    }
  };

  /**
   * Documents are extracted one after another rather than in parallel: OCR and PDF
   * parsing are heavy, and a serial pass keeps the progress line meaningful. One file
   * failing reports that file and leaves the rest of the batch alone.
   */
  const uploadDocuments = async (files: File[]) => {
    setDocumentError(null);
    const failures: string[] = [];
    const batch = files.slice(0, MAX_DOCUMENTS_PER_UPLOAD);
    if (files.length > batch.length) {
      failures.push(
        `Only the first ${MAX_DOCUMENTS_PER_UPLOAD} of ${files.length} files were read. Upload the rest in another batch.`,
      );
    }

    for (const [index, file] of batch.entries()) {
      try {
        const kind = validateDocument(file);
        const extracted = await extractDocumentText(file, (progress) =>
          setDocumentProgress(
            batch.length > 1
              ? `${file.name} (${index + 1} of ${batch.length}) — ${progress.label}`
              : progress.label,
          ),
        );
        onDocumentAdd({
          id: `${file.name}-${file.size}`,
          name: file.name,
          kind,
          text: extracted.text,
          policyId: policies[0]?.id ?? "",
          uploadedAt: new Date().toISOString(),
        });
      } catch (error) {
        failures.push(
          `${file.name}: ${error instanceof Error ? error.message : "could not be read"}`,
        );
      }
    }

    setDocumentProgress(null);
    setDocumentError(failures.length > 0 ? failures.join(" · ") : null);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge variant="outline">Step 1</Badge> Connect your sources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Github className="h-3.5 w-3.5" aria-hidden /> Code — the source of truth
          </div>

          {repository ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="text-sm">
                <span className="font-mono">
                  {repository.owner}/{repository.repo}
                </span>
                {repository.pullNumber ? (
                  <span className="text-muted-foreground"> · PR #{repository.pullNumber}</span>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {repository.origin === "fetched" ? "Fetched from GitHub" : "Diff pasted locally"}
                  {parsedDiff
                    ? ` · ${parsedDiff.path} · +${parsedDiff.additions} −${parsedDiff.deletions}`
                    : null}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => onRepositoryChange(null)}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plumb-repo" className="text-xs">
                    Repository
                  </Label>
                  <Input
                    id="plumb-repo"
                    placeholder="owner/name or https://github.com/owner/name"
                    value={repoInput}
                    onChange={(event) => setRepoInput(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plumb-pr" className="text-xs">
                    Pull request number {mode === "paste" ? "(optional)" : ""}
                  </Label>
                  <Input
                    id="plumb-pr"
                    inputMode="numeric"
                    placeholder="2431"
                    value={pullNumber}
                    onChange={(event) => setPullNumber(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Diff source">
                {(["paste", "fetch"] as RepositoryMode[]).map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    role="radio"
                    aria-checked={mode === option}
                    variant={mode === option ? "default" : "outline"}
                    onClick={() => setMode(option)}
                  >
                    {option === "paste" ? "Paste a diff" : "Fetch from GitHub"}
                  </Button>
                ))}
              </div>

              {mode === "paste" ? (
                <div className="space-y-2">
                  <Textarea
                    aria-label="Unified diff"
                    className="font-mono text-xs min-h-32"
                    placeholder={
                      "@@ -40,7 +40,7 @@\n-  kycThreshold: 10_000,\n+  kycThreshold: 25_000,"
                    }
                    value={pastedDiff}
                    onChange={(event) => setPastedDiff(event.target.value)}
                  />
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" aria-hidden />
                    Parsed in this browser. Nothing is uploaded and no network request is made.
                  </p>
                  <Button size="sm" onClick={connectPastedDiff}>
                    Use this diff
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="flex items-start gap-1.5 rounded-md border border-[color:var(--revise)]/40 bg-[color:var(--revise)]/10 px-3 py-2 text-xs">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--revise)]"
                      aria-hidden
                    />
                    <span>
                      This is the one action in JurisCore that leaves your machine. It requests the
                      diff from api.github.com. Public repositories only, and the diff is not sent
                      anywhere afterwards.
                    </span>
                  </p>
                  <Button size="sm" onClick={fetchPullRequest} disabled={fetching}>
                    {fetching ? "Fetching…" : "Fetch pull request"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {repoError && (
            <p role="alert" className="text-xs text-[color:var(--block)]">
              {repoError}
            </p>
          )}
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden /> Documents — the claims to validate
          </div>
          <p className="text-xs text-muted-foreground">
            Upload the filings, sales decks, and internal policies that make claims about this code.
            Each document is reviewed under the policy pack you link it to. Text is extracted in
            this browser; the file itself is never uploaded or stored.
          </p>

          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            accept={ACCEPTED_DOCUMENT_TYPES}
            aria-label="Upload documents"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void uploadDocuments(files);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Upload documents
            </Button>
            <span className="text-xs text-muted-foreground">
              {ACCEPTED_DOCUMENT_LABEL} · up to {MAX_DOCUMENTS_PER_UPLOAD} files per upload · 25 MB
              each
            </span>
          </div>

          {documentProgress && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {documentProgress}…
            </p>
          )}
          {documentError && (
            <p role="alert" className="text-xs text-[color:var(--block)]">
              {documentError}
            </p>
          )}

          {documents.length > 0 && (
            <ul className="space-y-2">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="text-sm">
                    <div className="font-mono text-xs">{document.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {document.kind.toUpperCase()} · {document.text.length.toLocaleString()}{" "}
                      characters extracted
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={document.policyId}
                      onValueChange={(value) => onDocumentPolicyChange(document.id, value)}
                    >
                      <SelectTrigger className="h-8 w-56 text-xs" aria-label="Linked policy">
                        <SelectValue placeholder="Link a policy" />
                      </SelectTrigger>
                      <SelectContent>
                        {policies.map((policy) => (
                          <SelectItem key={policy.id} value={policy.id}>
                            {policy.shortName}
                            {policy.custom ? " · custom" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${document.name}`}
                      onClick={() => onDocumentRemove(document.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
