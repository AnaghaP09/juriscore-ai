import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import { gatewayModelLabel } from "@/lib/juriscore/gateway/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const mutedBadge = "border-border text-muted-foreground";
const allowBadge = "border-[color:var(--allow)]/40 text-[color:var(--allow)]";
const blockBadge = "border-[color:var(--block)]/40 text-[color:var(--block)]";

function verifiedTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Header Active Model control. Every state it shows comes from the server: "Connected"
 * appears only when the server reports a successful live check for the selected model.
 */
export function ActiveModelControl() {
  const { activeModel, setActiveModel, gateway, checkingModels, verifyGatewayModel } =
    useDemoStore();
  const [unlockOpen, setUnlockOpen] = useState(false);

  // An expired session reopens the Unlock dialog; a first visit only offers the button.
  useEffect(() => {
    if (gateway.phase === "locked" && gateway.expired) setUnlockOpen(true);
  }, [gateway]);

  const notConfigured = (title: string) => (
    <Badge variant="outline" className={mutedBadge} title={title}>
      Not configured
    </Badge>
  );

  let control: ReactNode;
  if (gateway.phase === "loading") {
    control = (
      <Badge variant="outline" className={mutedBadge}>
        Loading…
      </Badge>
    );
  } else if (gateway.phase === "unavailable" && gateway.reason === "error") {
    control = (
      <Badge variant="outline" className={mutedBadge} title={gateway.message}>
        Gateway unavailable
      </Badge>
    );
  } else if (gateway.phase === "unavailable") {
    control = notConfigured(
      gateway.reason === "disabled"
        ? "The gateway is not enabled on this server."
        : "The gateway is enabled without an access token.",
    );
  } else if (gateway.phase === "locked") {
    control = (
      <Button size="sm" variant="outline" className="h-8" onClick={() => setUnlockOpen(true)}>
        <KeyRound className="h-3.5 w-3.5 mr-1.5" aria-hidden />
        {gateway.expired ? "Session expired · Unlock" : "Unlock gateway"}
      </Button>
    );
  } else if (!gateway.status.configured || gateway.status.models.length === 0) {
    control = notConfigured(gateway.status.configError ?? "The gateway is not configured.");
  } else {
    const { status } = gateway;
    const connection = status.connections[activeModel];
    const checking = checkingModels.includes(activeModel);
    let badge: ReactNode;
    if (checking) {
      badge = (
        <Badge variant="outline" className={mutedBadge}>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden />
          Checking…
        </Badge>
      );
    } else if (connection?.state === "connected") {
      badge = (
        <Badge
          variant="outline"
          className={allowBadge}
          title={`verified ${verifiedTime(connection.lastVerifiedAt)}`}
        >
          Connected — {status.providerLabel} · {activeModel}
        </Badge>
      );
    } else if (connection?.state === "failed") {
      badge = (
        <>
          <Badge variant="outline" className={blockBadge}>
            Connection failed — {connection.error ?? "unknown reason"}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => void verifyGatewayModel(activeModel)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Retry
          </Button>
        </>
      );
    } else {
      badge = (
        <>
          <Badge variant="outline" className={mutedBadge}>
            Not connected
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => void verifyGatewayModel(activeModel)}
          >
            Test connection
          </Button>
        </>
      );
    }
    control = (
      <>
        <Select value={activeModel} onValueChange={setActiveModel}>
          <SelectTrigger className="h-8 w-48" aria-label="Active model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {status.models.map((modelId) => (
              <SelectItem key={modelId} value={modelId}>
                {gatewayModelLabel(modelId)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {badge}
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Active model</span>
      {control}
      <UnlockGatewayDialog open={unlockOpen} onOpenChange={setUnlockOpen} />
    </div>
  );
}

/**
 * Sends the JurisCore gateway token once to exchange it for an HttpOnly session cookie.
 * It is not a provider credential, and the page does not keep it after submitting.
 */
function UnlockGatewayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { unlockGateway } = useDemoStore();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setToken("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    const message = await unlockGateway(token.trim());
    setBusy(false);
    setToken("");
    if (message) {
      setError(message);
      return;
    }
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Unlock gateway</DialogTitle>
            <DialogDescription>
              Enter your JurisCore gateway token. This is not your Anthropic API key: the provider
              key stays on the server and never reaches this page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="gateway-token" className="text-sm font-medium">
              Gateway token
            </label>
            <Input
              id="gateway-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-[color:var(--block)]">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !token.trim()}>
              {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
