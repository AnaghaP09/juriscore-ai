import { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoStore } from "@/lib/juriscore/demo-store";

export function KillSwitchOverlay() {
  const { killSwitch, setKillSwitch } = useDemoStore();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!killSwitch) return;
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKillSwitch(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [killSwitch, setKillSwitch]);

  if (!killSwitch) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="kill-title"
      aria-describedby="kill-desc"
      className="lockdown-scrim fixed inset-0 z-[100] flex items-center justify-center px-6"
    >
      <div className="max-w-lg text-center rounded-2xl border border-[color:var(--block)]/50 bg-background/90 backdrop-blur-xl p-10 shadow-2xl">
        <div className="mx-auto h-16 w-16 rounded-full bg-[color:var(--block)]/15 flex items-center justify-center mb-6 shield-pulse">
          <ShieldAlert className="h-8 w-8 text-[color:var(--block)]" aria-hidden="true" />
        </div>
        <h2 id="kill-title" className="text-2xl font-semibold tracking-tight">Shield Active</h2>
        <p id="kill-desc" className="mt-2 text-sm text-muted-foreground">
          Model endpoints blocked. All outbound calls to Gemini, Claude, and GPT-4o are frozen by the CISO Kill Switch.
        </p>
        <div className="mt-3 font-mono text-xs text-[color:var(--block)]">SYSTEM STATE · LOCKDOWN</div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button ref={btnRef} variant="destructive" onClick={() => setKillSwitch(false)}>Disarm Kill Switch</Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Press <kbd className="font-mono">Esc</kbd> to dismiss</p>
      </div>
    </div>
  );
}
