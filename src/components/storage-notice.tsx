import { AlertTriangle } from "lucide-react";
import { useDemoStore } from "@/lib/juriscore/demo-store";

/** The single note shown when browser storage failed and state is held in memory. */
export function StorageNotice() {
  const { storageNote } = useDemoStore();
  if (!storageNote) return null;
  return (
    <div
      role="status"
      className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-[color:var(--revise)]/40 bg-[color:var(--revise)]/[0.06] px-3 py-2 text-xs sm:mx-8"
    >
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--revise)]"
        aria-hidden
      />
      <span>{storageNote}</span>
    </div>
  );
}
