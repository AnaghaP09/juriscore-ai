import { Badge } from "@/components/ui/badge";
import type { ValidationReceipt } from "@/lib/juriscore/core/contracts";

export function ReceiptSummary({
  receipt,
  error,
  verdictLabel = "Verdict",
  className,
}: {
  receipt: ValidationReceipt | null;
  error: string | null;
  verdictLabel?: string;
  className?: string;
}) {
  if (!receipt && !error) return null;
  return (
    <div className={className}>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--block)]">
          {error}
        </p>
      )}
      {receipt && (
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Receipt id</dt>
            <dd className="break-all font-mono text-xs">{receipt.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{verdictLabel}</dt>
            <dd className="font-mono uppercase">{receipt.verdict}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Active policies</dt>
            <dd className="break-all font-mono text-xs">{receipt.policyVersion}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Maturity</dt>
            <dd>
              <Badge variant="outline" className="text-[color:var(--revise)]">
                Synthetic
              </Badge>
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
