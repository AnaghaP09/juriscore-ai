import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { ReceiptVerifier } from "@/components/receipt-verifier";
import {
  ChevronDown,
  Download,
  FileJson,
  FileText,
  FolderOpen,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { AUDIT, type AuditEntry, type Verdict } from "@/lib/juriscore/mock";
import { downloadCSV, openPrintReport, htmlTable, kpiCard } from "@/lib/juriscore/export";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import {
  persistedReceiptSchema,
  type PersistedReceipt,
  type ValidationModule,
} from "@/lib/juriscore/core/contracts";
import {
  RECEIPT_HISTORY_LIMIT,
  receiptStore,
  receiptsToCsv,
  receiptsToJson,
  type ReceiptFilter,
  type ReceiptPage,
} from "@/lib/juriscore/core/receipt-store";
import { receiptDomainResolver } from "@/lib/juriscore/core/receipt-domains";
import {
  forgetReceiptFolder,
  getReceiptFolder,
  pickReceiptFolder,
  receiptFolderSupported,
} from "@/lib/juriscore/core/receipt-folder";
import { downloadText, fileTimestamp, receiptDigestVersion } from "@/lib/juriscore/core/receipts";

export const Route = createFileRoute("/dashboard/audit")({
  head: () => ({
    meta: [
      { title: "Receipts — JurisCore AI" },
      {
        name: "description",
        content: "Browser-local history of Veil and Plumb receipts, with export and verification.",
      },
    ],
  }),
  component: ReceiptsPage,
});

const PAGE_SIZE = 50;

function verdictColor(v: Verdict) {
  return v === "allow"
    ? "bg-[color:var(--allow)]/15 text-[color:var(--allow)] border-[color:var(--allow)]/30"
    : v === "block"
      ? "bg-[color:var(--block)]/15 text-[color:var(--block)] border-[color:var(--block)]/30"
      : "bg-[color:var(--revise)]/15 text-[color:var(--revise)] border-[color:var(--revise)]/30";
}

function pageLabel(offset: number, shown: number, total: number) {
  if (total === 0) return "Showing 0 of 0";
  return `Showing ${offset + 1}–${offset + shown} of ${total}`;
}

function Pager({
  offset,
  total,
  onChange,
}: {
  offset: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}
      >
        Previous
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={offset + PAGE_SIZE >= total}
        onClick={() => onChange(offset + PAGE_SIZE)}
      >
        Next
      </Button>
    </div>
  );
}

function ReceiptsPage() {
  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="JurisCore"
        title="Receipts"
        description="Every Plumb check, and every Veil result you copy, save, or download, leaves a receipt here. Receipts hold digests, verdicts, and policy versions — never your text."
      />
      <YourReceipts />
      <OpenReceipt />
      <DemoRecords />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your receipts (browser-local history)
// ---------------------------------------------------------------------------

function YourReceipts() {
  const { receiptsTrimmed, customPolicies } = useDemoStore();
  const [module, setModule] = useState<ValidationModule | "all">("all");
  const [verdict, setVerdict] = useState<Verdict | "all">("all");
  const [domain, setDomain] = useState<string>("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ReceiptPage>({ items: [], total: 0 });
  const [domainOptions, setDomainOptions] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [folderSupported, setFolderSupported] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  // Refreshes can overlap when receipts arrive quickly; only the latest one is applied.
  const refreshSeq = useRef(0);

  // Domains are derived from each receipt's policy version against the current catalog,
  // so an edited or deleted custom policy is reflected (or reads "Custom (removed)").
  const domainOf = useMemo(() => receiptDomainResolver(customPolicies), [customPolicies]);

  const filter = useMemo<ReceiptFilter>(
    () => ({ module, verdict, q, domain, domainOf }),
    [module, verdict, q, domain, domainOf],
  );

  // Live: runs on mount, on every filter or page change, and on every store change —
  // including receipts added in another tab (BroadcastChannel via the store).
  const refresh = useCallback(() => {
    const seq = ++refreshSeq.current;
    const store = receiptStore();
    Promise.all([
      store.listReceipts({ ...filter, offset, limit: PAGE_SIZE }),
      store.exportReceipts(),
    ])
      .then(([nextPage, all]) => {
        if (seq !== refreshSeq.current) return;
        setPage(nextPage);
        setDomainOptions([...new Set(all.flatMap(domainOf))].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => undefined);
  }, [filter, offset, domainOf]);

  useEffect(() => {
    refresh();
    return receiptStore().onChange(refresh);
  }, [refresh]);

  useEffect(() => {
    setOffset(0);
  }, [filter]);

  useEffect(() => {
    // Feature detection runs after mount: the server render has no window.
    const supported = receiptFolderSupported();
    setFolderSupported(supported);
    if (supported) {
      void getReceiptFolder().then((handle) => setFolderName(handle?.name ?? null));
    }
  }, []);

  const exportAs = async (format: "csv" | "json") => {
    const all = await receiptStore().exportReceipts(filter);
    const stamp = fileTimestamp();
    if (format === "csv") {
      const csv = receiptsToCsv(all, domainOf);
      downloadText(`juriscore-receipts-${stamp}.csv`, csv, "text/csv;charset=utf-8");
    } else {
      downloadText(`juriscore-receipts-${stamp}.json`, receiptsToJson(all), "application/json");
    }
  };

  const clearHistory = async () => {
    await receiptStore().clearReceipts();
    setConfirmClear(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Your receipts
          </span>
          <Badge variant="outline">Browser-local history, not an audit record</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Kept in this browser only, newest {RECEIPT_HISTORY_LIMIT}. Older receipts are dropped
          automatically; export what you need to keep.
        </p>
        {receiptsTrimmed > 0 && (
          <p role="status" className="text-xs text-[color:var(--revise)]">
            {receiptsTrimmed} oldest {receiptsTrimmed === 1 ? "receipt was" : "receipts were"}{" "}
            dropped this session to keep the latest {RECEIPT_HISTORY_LIMIT}.
          </p>
        )}

        {folderSupported && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
            <FolderOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
            {folderName ? (
              <>
                <span>
                  New receipts are also saved to the folder{" "}
                  <span className="font-mono">{folderName}</span>.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await forgetReceiptFolder();
                    setFolderName(null);
                  }}
                >
                  Stop saving to folder
                </Button>
              </>
            ) : (
              <>
                <span>Also save each new receipt to a folder on this computer.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const handle = await pickReceiptFolder();
                    if (handle) setFolderName(handle.name);
                  }}
                >
                  Choose folder
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3" role="search" aria-label="Filter your receipts">
          <div className="flex-1 min-w-[12rem] max-w-xs">
            <label htmlFor="receipt-search" className="sr-only">
              Search receipts
            </label>
            <Input
              id="receipt-search"
              type="search"
              placeholder="Search id, module, or policy…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="receipt-module" className="sr-only">
              Filter by module
            </label>
            <Select
              value={module}
              onValueChange={(value) => setModule(value as ValidationModule | "all")}
            >
              <SelectTrigger id="receipt-module" className="w-36">
                <SelectValue placeholder="Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                <SelectItem value="veil">Veil</SelectItem>
                <SelectItem value="plumb">Plumb</SelectItem>
                <SelectItem value="gateway">Gateway</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="receipt-verdict" className="sr-only">
              Filter by verdict
            </label>
            <Select value={verdict} onValueChange={(value) => setVerdict(value as Verdict | "all")}>
              <SelectTrigger id="receipt-verdict" className="w-36">
                <SelectValue placeholder="Verdict" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verdicts</SelectItem>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="revise">Revise</SelectItem>
                <SelectItem value="block">Block</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="receipt-domain" className="sr-only">
              Filter by domain
            </label>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger id="receipt-domain" className="w-48">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {(domain === "all" || domainOptions.includes(domain)
                  ? domainOptions
                  : [...domainOptions, domain]
                ).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div aria-live="polite" className="ml-auto self-center text-sm text-muted-foreground">
            {pageLabel(offset, page.items.length, page.total)}
          </div>
          <Button variant="outline" size="sm" onClick={() => void exportAs("csv")}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportAs("json")}>
            <FileJson className="mr-2 h-4 w-4" aria-hidden />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Clear history
          </Button>
        </div>

        {confirmClear && (
          <div
            role="alertdialog"
            aria-label="Confirm clearing receipt history"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--block)]/40 bg-[color:var(--block)]/[0.05] px-3 py-2 text-sm"
          >
            <span>
              Delete every receipt in this browser&apos;s history? Downloaded and exported files are
              not affected.
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void clearHistory()}>
                Delete history
              </Button>
            </span>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" aria-label="Your receipts">
            <caption className="sr-only">
              Receipts stored in this browser, newest first, {PAGE_SIZE} per page.
            </caption>
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  ID
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Module
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Verdict
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Domain
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Policy version
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Findings
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Input digest
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((receipt) => (
                <tr key={receipt.id} className="border-t border-border/60">
                  <td
                    className="max-w-[16rem] truncate px-4 py-2 font-mono text-xs"
                    title={receipt.id}
                  >
                    {receipt.id}
                  </td>
                  <td className="px-4 py-2 capitalize">{receipt.module}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={`border ${verdictColor(receipt.verdict)}`}>
                      {receipt.verdict}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs">{domainOf(receipt).join(", ")}</td>
                  <td
                    className="max-w-[18rem] truncate px-4 py-2 font-mono text-xs"
                    title={receipt.policyVersion}
                  >
                    {receipt.policyVersion}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {receipt.findingIds.length}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs" title={receipt.inputDigest}>
                    {receipt.inputDigest.slice(0, 12)}…
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">
                    {receipt.createdAt.slice(0, 19).replace("T", " ")}
                  </td>
                </tr>
              ))}
              {page.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {page.total === 0 &&
                    !q &&
                    module === "all" &&
                    verdict === "all" &&
                    domain === "all"
                      ? "No receipts yet. Run a Plumb check, or copy, save, or download a Veil result."
                      : "No receipts match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager offset={offset} total={page.total} onChange={setOffset} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Open & verify a receipt file
// ---------------------------------------------------------------------------

type OpenedReceipt = { fileName: string; receipt: PersistedReceipt };

function OpenReceipt() {
  const [opened, setOpened] = useState<OpenedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = async (file: File) => {
    setError(null);
    setOpened(null);
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setError(`${file.name} is not valid JSON.`);
      return;
    }
    const parsed = persistedReceiptSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        `${file.name} is not a valid JurisCore receipt${
          issue ? ` (${issue.path.join(".") || "receipt"}: ${issue.message})` : ""
        }.`,
      );
      return;
    }
    setOpened({ fileName: file.name, receipt: parsed.data });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>Open &amp; verify a receipt</span>
          <span>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Open a receipt file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void openFile(file);
                event.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
              <FileJson className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Open receipt file
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Checks that a receipt file is well formed, then lets you re-supply the original input to
          confirm the digest. Anything you paste or load here stays in this panel and is discarded
          when it closes.
        </p>
        {error && (
          <p role="alert" className="text-sm text-[color:var(--block)]">
            {error}
          </p>
        )}
        {opened && (
          <div className="space-y-4 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Receipt id</dt>
                  <dd className="break-all font-mono text-xs">{opened.receipt.id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Schema</dt>
                  <dd className="text-[color:var(--allow)]">Valid receipt</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Verdict</dt>
                  <dd className="font-mono uppercase">{opened.receipt.verdict}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Digest version</dt>
                  <dd className="font-mono text-xs">
                    {receiptDigestVersion(opened.receipt)}
                    {opened.receipt.digestVersion ? "" : " (legacy, inferred)"}
                  </dd>
                </div>
              </dl>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Close receipt"
                onClick={() => setOpened(null)}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <ReceiptVerifier key={opened.receipt.id} receipt={opened.receipt} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Demo data (synthetic)
// ---------------------------------------------------------------------------

function DemoRecords() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<string>("all");
  const [verdict, setVerdict] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return AUDIT.filter((a) => {
      if (domain !== "all" && a.domain !== domain) return false;
      if (verdict !== "all" && a.verdict !== verdict) return false;
      if (
        needle &&
        !(
          a.id.toLowerCase().includes(needle) ||
          a.prompt.toLowerCase().includes(needle) ||
          a.useCase.toLowerCase().includes(needle)
        )
      ) {
        return false;
      }
      return true;
    });
  }, [q, domain, verdict]);

  useEffect(() => {
    setOffset(0);
  }, [q, domain, verdict]);

  const pageRows = rows.slice(offset, offset + PAGE_SIZE);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-left">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
                  aria-hidden
                />
                Demo data · synthetic
              </button>
            </CollapsibleTrigger>
            <Badge variant="outline" className="text-[color:var(--revise)]">
              Demo data · synthetic
            </Badge>
          </CardTitle>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              The entries below are synthetic demonstration records, not measurements or real
              receipts.
            </p>

            <div className="flex flex-wrap gap-3" role="search" aria-label="Filter demo records">
              <div className="flex-1 min-w-[12rem] max-w-xs">
                <label htmlFor="audit-search" className="sr-only">
                  Search demo records
                </label>
                <Input
                  id="audit-search"
                  type="search"
                  placeholder="Search prompt, use case, or ID…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="audit-domain" className="sr-only">
                  Filter by domain
                </label>
                <Select value={domain} onValueChange={setDomain}>
                  <SelectTrigger id="audit-domain" className="w-40">
                    <SelectValue placeholder="Domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="audit-verdict" className="sr-only">
                  Filter by verdict
                </label>
                <Select value={verdict} onValueChange={setVerdict}>
                  <SelectTrigger id="audit-verdict" className="w-40">
                    <SelectValue placeholder="Verdict" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All verdicts</SelectItem>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="revise">Revise</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div aria-live="polite" className="ml-auto text-sm text-muted-foreground self-center">
                {pageLabel(offset, pageRows.length, rows.length)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  downloadCSV(
                    "juriscore_demo_records.csv",
                    rows.map((r) => ({
                      id: r.id,
                      ts: r.ts,
                      domain: r.domain,
                      useCase: r.useCase,
                      verdict: r.verdict,
                      latencyMs: r.latencyMs,
                      blockedStage: r.blockedStage ?? "",
                      reason: r.reason ?? "",
                      ruleId: r.retrievedPolicyIds[0] ?? "",
                      citationCoverage: r.citationCoverage,
                      prompt: r.prompt,
                    })),
                  );
                }}
              >
                <Download className="h-4 w-4 mr-2" aria-hidden />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const blocked = rows.filter((r) => r.verdict === "block").length;
                  const revised = rows.filter((r) => r.verdict === "revise").length;
                  openPrintReport({
                    title: "Demo Records Export (synthetic)",
                    subtitle: `${rows.length} entries · filters: domain=${domain}, verdict=${verdict}${q ? `, query="${q}"` : ""}`,
                    sections: [
                      {
                        heading: "Summary",
                        html: `<div class="grid">${[
                          kpiCard("Entries", String(rows.length)),
                          kpiCard("Blocked", String(blocked)),
                          kpiCard("Revised", String(revised)),
                          kpiCard("Allowed", String(rows.length - blocked - revised)),
                        ].join("")}</div>`,
                      },
                      {
                        heading: "Entries",
                        html: htmlTable(
                          [
                            "ID",
                            "Time (UTC)",
                            "Domain",
                            "Use case",
                            "Verdict",
                            "Rule",
                            "Latency",
                            "Reason",
                          ],
                          rows.map((r) => [
                            r.id,
                            r.ts.slice(0, 16).replace("T", " "),
                            r.domain,
                            r.useCase,
                            r.verdict,
                            r.retrievedPolicyIds[0] ?? "—",
                            `${r.latencyMs}ms`,
                            r.reason ?? "—",
                          ]),
                        ),
                      },
                    ],
                  });
                }}
              >
                <FileText className="h-4 w-4 mr-2" aria-hidden />
                PDF
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm" aria-label="Synthetic demo records">
                <caption className="sr-only">
                  Synthetic demo records, {PAGE_SIZE} per page, in generated order. Activate a row
                  to open its full trace.
                </caption>
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      ID
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Time
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Domain
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Use case
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Rule ID
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Verdict
                    </th>
                    <th scope="col" className="text-right px-4 py-2 font-medium">
                      Latency
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open trace for ${r.id}, ${r.verdict}, ${r.useCase}`}
                      onClick={() => setSelected(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(r);
                        }
                      }}
                      className="border-t border-border/60 hover:bg-muted/30 focus:bg-muted/40 cursor-pointer outline-none"
                    >
                      <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {r.ts.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-2 capitalize">{r.domain}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.useCase}</td>
                      <td className="px-4 py-2 font-mono text-xs text-primary">
                        {r.retrievedPolicyIds[0] ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Badge className={`border ${verdictColor(r.verdict)}`} variant="outline">
                          {r.verdict}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{r.latencyMs}ms</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No entries match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager offset={offset} total={rows.length} onChange={setOffset} />
          </CardContent>
        </CollapsibleContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{selected.id}</SheetTitle>
                <SheetDescription>
                  {selected.domain} · {selected.useCase} ·{" "}
                  {selected.ts.slice(0, 16).replace("T", " ")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 px-1">
                <Stage title="1 · Prompt" body={selected.prompt} />
                <Stage
                  title="2 · Input guardrail"
                  body={
                    selected.blockedStage === "input_guardrail"
                      ? `BLOCKED — ${selected.reason}`
                      : "Passed — no PII/injection detected"
                  }
                  tone={selected.blockedStage === "input_guardrail" ? "block" : "allow"}
                />
                <Stage
                  title="3 · Retrieved policies"
                  body={selected.retrievedPolicyIds.join(", ") || "—"}
                  mono
                />
                <Stage title="4 · Draft response" body={selected.draftResponse} />
                <Stage
                  title="5 · Citation check"
                  body={`Coverage ${(selected.citationCoverage * 100).toFixed(0)}%${selected.blockedStage === "citation" ? ` — ${selected.reason}` : ""}`}
                  tone={
                    selected.blockedStage === "citation"
                      ? "block"
                      : selected.citationCoverage < 0.7
                        ? "revise"
                        : "allow"
                  }
                />
                <Stage
                  title="6 · Final verdict"
                  body={
                    selected.finalResponse ?? `Blocked — ${selected.reason ?? "policy violation"}`
                  }
                  tone={selected.verdict}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Collapsible>
  );
}

function Stage({
  title,
  body,
  tone,
  mono,
}: {
  title: string;
  body: string;
  tone?: Verdict;
  mono?: boolean;
}) {
  const border =
    tone === "block"
      ? "border-[color:var(--block)]/40"
      : tone === "allow"
        ? "border-[color:var(--allow)]/40"
        : tone === "revise"
          ? "border-[color:var(--revise)]/40"
          : "border-border";
  return (
    <div className={`rounded-md border ${border} bg-muted/20 p-3`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className={mono ? "font-mono text-xs" : "text-sm"}>{body}</div>
    </div>
  );
}
