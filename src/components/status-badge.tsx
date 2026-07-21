import * as React from "react";
import { cn } from "@/lib/utils";
import type { LegalStatus } from "@/lib/juriscore/legal-mock";

/**
 * Legal-workflow status badge. Uses semantic tokens (never hard-coded colors)
 * so the badge tracks the shared design system in every theme.
 *
 * Palette rationale:
 *  - Urgent / Escalated → destructive (block-red)
 *  - Pending Review     → revise (amber)
 *  - Awaiting Client    → accent (soft yellow)
 *  - Scheduled / Draft  → muted neutral
 *  - Signed             → allow (green)
 */
const STATUS_STYLES: Record<LegalStatus, string> = {
  Urgent:
    "bg-[color:var(--block)]/12 text-[color:var(--block)] ring-[color:var(--block)]/25",
  Escalated:
    "bg-[color:var(--block)]/10 text-[color:var(--block)] ring-[color:var(--block)]/20",
  "Pending Review":
    "bg-[color:var(--revise)]/20 text-[color:oklch(0.35_0.08_80)] ring-[color:var(--revise)]/40",
  "Awaiting Client":
    "bg-accent/60 text-accent-foreground ring-accent",
  Scheduled:
    "bg-muted text-muted-foreground ring-border",
  Draft:
    "bg-muted text-muted-foreground ring-border",
  Signed:
    "bg-[color:var(--allow)]/12 text-[color:var(--allow)] ring-[color:var(--allow)]/25",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  status: LegalStatus;
  dot?: boolean;
}

export function StatusBadge({
  status,
  dot = true,
  className,
  ...rest
}: StatusBadgeProps) {
  return (
    <span
      role="status"
      aria-label={`Status: ${status}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-[11px] font-medium leading-5 ring-1 ring-inset",
        "whitespace-nowrap",
        STATUS_STYLES[status],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current opacity-80"
        />
      )}
      {status}
    </span>
  );
}
