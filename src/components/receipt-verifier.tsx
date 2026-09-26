import { useRef, useState } from "react";
import { CheckCircle2, Upload, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PersistedReceipt } from "@/lib/juriscore/core/contracts";
import {
  verificationMode,
  verifyPlumbSources,
  verifyVeilText,
  type DigestMatch,
  type PlumbVerification,
} from "@/lib/juriscore/core/receipt-verify";
import {
  ACCEPTED_DOCUMENT_TYPES,
  extractDocumentText,
  validateDocument,
} from "@/lib/juriscore/veil/document-extraction";

/**
 * Re-checks a receipt against text the user supplies again. Isolated by design: the
 * text lives in this component's state only, it goes to pure digest functions, and it
 * is dropped when the verifier closes. Nothing here reads or writes the demo store,
 * browser storage, or the receipt history.
 */
export function ReceiptVerifier({ receipt }: { receipt: PersistedReceipt }) {
  const mode = verificationMode(receipt);
  if (mode.kind === "veil-text") return <VeilVerifier receipt={receipt} />;
  if (mode.kind === "plumb-sources") return <PlumbVerifier receipt={receipt} />;
  return (
    <div role="status" className="rounded-md border border-border bg-muted/20 p-3 text-sm">
      <div className="font-medium">Verification unavailable</div>
      <p className="mt-1 text-xs text-muted-foreground">{mode.reason}</p>
    </div>
  );
}

function MatchLine({ label, match }: { label: string; match: DigestMatch }) {
  const matches = match === "matches";
  return (
    <p
      className={`flex items-center gap-2 text-sm ${
        matches ? "text-[color:var(--allow)]" : "text-[color:var(--block)]"
      }`}
    >
      {matches ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden />
      ) : (
        <XCircle className="h-4 w-4" aria-hidden />
      )}
      {label}
    </p>
  );
}

function VeilVerifier({ receipt }: { receipt: PersistedReceipt }) {
  const [text, setText] = useState("");
  const [match, setMatch] = useState<DigestMatch | null>(null);

  return (
    <div className="space-y-2">
      <Label htmlFor="verify-veil-input" className="text-xs">
        Paste the original input exactly as it was checked
      </Label>
      <Textarea
        id="verify-veil-input"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setMatch(null);
        }}
        rows={6}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={async () => setMatch(await verifyVeilText(receipt, text))}
          disabled={!text}
        >
          Verify
        </Button>
        <div aria-live="polite">
          {match && (
            <MatchLine
              label={
                match === "matches"
                  ? "Input matches this receipt's digest."
                  : "Input does not match this receipt's digest."
              }
              match={match}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface VerifierDocument {
  key: string;
  name: string;
  text: string;
}

function PlumbVerifier({ receipt }: { receipt: PersistedReceipt }) {
  const [diff, setDiff] = useState("");
  const [documents, setDocuments] = useState<VerifierDocument[]>([]);
  const [pastedName, setPastedName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [result, setResult] = useState<PlumbVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const diffInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  const changed = () => {
    setResult(null);
    setError(null);
  };

  const addDocument = (name: string, text: string) => {
    changed();
    setDocuments((current) => [
      ...current.filter((document) => document.name !== name),
      { key: `${name}-${current.length}-${text.length}`, name, text },
    ]);
  };

  const uploadDocuments = async (files: File[]) => {
    setBusy(true);
    try {
      for (const file of files) {
        validateDocument(file);
        const extracted = await extractDocumentText(file, () => undefined);
        addDocument(file.name, extracted.text);
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "A document could not be read.",
      );
    } finally {
      setBusy(false);
      if (documentInput.current) documentInput.current.value = "";
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await verifyPlumbSources(receipt, {
          diff,
          documents: documents.map(({ name, text }) => ({ name, text })),
        }),
      );
    } catch {
      setError("The supplied sources could not be digested.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Load the same diff (or source file) and the same documents the check compared. They stay in
        this panel only and are discarded when it closes.
      </p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="verify-plumb-diff" className="text-xs">
            Diff or source file
          </Label>
          <input
            ref={diffInput}
            type="file"
            className="sr-only"
            aria-label="Load the diff from a file"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                changed();
                setDiff(await file.text());
              }
              event.target.value = "";
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => diffInput.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Load file
          </Button>
        </div>
        <Textarea
          id="verify-plumb-diff"
          value={diff}
          onChange={(event) => {
            changed();
            setDiff(event.target.value);
          }}
          rows={6}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Documents ({documents.length})</span>
          <input
            ref={documentInput}
            type="file"
            multiple
            accept={ACCEPTED_DOCUMENT_TYPES}
            className="sr-only"
            aria-label="Load documents"
            onChange={(event) => void uploadDocuments([...(event.target.files ?? [])])}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => documentInput.current?.click()}
            disabled={busy}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Load documents
          </Button>
        </div>
        {documents.length > 0 && (
          <ul className="space-y-1 text-xs">
            {documents.map((document) => (
              <li key={document.key} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{document.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${document.name}`}
                  onClick={() => {
                    changed();
                    setDocuments((current) => current.filter((item) => item !== document));
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
          <Input
            aria-label="Pasted document name"
            placeholder="Document name"
            value={pastedName}
            onChange={(event) => setPastedName(event.target.value)}
          />
          <Textarea
            aria-label="Pasted document text"
            placeholder="Or paste a document's text"
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            rows={2}
            className="text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!pastedName.trim() || !pastedText}
            onClick={() => {
              addDocument(pastedName.trim(), pastedText);
              setPastedName("");
              setPastedText("");
            }}
          >
            Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A document's name must be the file name it had when checked; it is part of the claims
          digest.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={verify} disabled={busy || !diff}>
          Verify
        </Button>
        {error && (
          <p role="alert" className="text-xs text-[color:var(--block)]">
            {error}
          </p>
        )}
      </div>
      <div aria-live="polite" className="space-y-1">
        {result && (
          <>
            <MatchLine
              label={result.source === "matches" ? "Source text: matches" : "Source text: differs"}
              match={result.source}
            />
            <MatchLine
              label={
                result.claims === "matches" ? "Extracted claims: match" : "Extracted claims: differ"
              }
              match={result.claims}
            />
          </>
        )}
      </div>
    </div>
  );
}
