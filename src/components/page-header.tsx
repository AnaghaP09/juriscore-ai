import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Shared page-header primitive. Enforces consistent typography, spacing and
 * action-slot alignment across every dashboard surface.
 */
export function PageHeader({
  title,
  description,
  icon,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="page-title flex flex-wrap items-center gap-2">
          {icon && (
            <span aria-hidden="true" className="inline-flex text-primary">
              {icon}
            </span>
          )}
          {title}
        </h1>
        {description && <p className="page-sub">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
