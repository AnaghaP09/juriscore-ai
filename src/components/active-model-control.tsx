import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import { gatewayModelLabel } from "@/lib/juriscore/gateway/models";
import { unlockBlockedByLocation } from "@/lib/juriscore/gateway/loopback";
import { suggestUnlockPhrase } from "@/lib/juriscore/gateway/suggest-phrase";
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

/** The single home of the setup steps (PLAN-5). The UI links here and holds no steps. */
export const GATEWAY_SETUP_URL =
  "https://github.com/AnaghaP09/juriscore-ai/blob/main/docs/GATEWAY_SETUP.md";

const mutedBadge = "border-border text-muted-foreground";
const allowBadge = "border-[color:var(--allow)]/40 text-[color:var(--allow)]";
const blockBadge = "border-[color:var(--block)]/40 text-[color:var(--block)]";

function verifiedTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SetupStepsLink({ label = "Setup steps" }: { label?: string }) {
  return (
    <a
      href={GATEWAY_SETUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

/**
 * Header Active Model control. Every state it shows comes from the server: "Connected"
 * appears only when the server reports a successful live check for the selected model.
 */
export function ActiveModelControl() {
  const {
    activeModel,
    setActiveModel,
    gateway,
    checkingModels,
    verifyGatewayModel,
    refreshGateway,
    retryGatewayStatus,
  } = useDemoStore();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  // An expired session reopens the Unlock dialog; a first visit only offers the button.
  useEffect(() => {
    if (gateway.phase === "locked" && gateway.expired) setUnlockOpen(true);
  }, [gateway]);

  const setupButton = (title: string) => (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      title={title}
      onClick={() => setSetupOpen(true)}
    >
      <Sparkles className="h-3.5 w-3.5 mr-1.5" aria-hidden />
      Set up gateway
    </Button>
  );

  let control: ReactNode;
  let configError: string | undefined;
  if (gateway.phase === "loading") {
    control = (
      <Badge variant="outline" className={mutedBadge}>
        Loading…
      </Badge>
    );
  } else if (gateway.phase === "unavailable" && gateway.reason === "error") {
    control = (
      <>
        <Badge variant="outline" className={mutedBadge} title={gateway.message}>
          Gateway unavailable
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={checkingModels.includes("__refresh__")}
          onClick={() => void refreshGateway()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Retry
        </Button>
      </>
    );
  } else if (gateway.phase === "unavailable") {
    control = setupButton(
      gateway.reason === "disabled"
        ? "No proprietary LLM API key is set on this server, or the gateway is disabled."
        : "The server has a key but no unlock phrase.",
    );
  } else if (gateway.phase === "status-unknown") {
    const recovering = checkingModels.length > 0;
    control = (
      <>
        <Badge variant="outline" className={mutedBadge} title={gateway.message}>
          {recovering ? "Unlocked. Loading gateway status…" : "Unlocked. Could not load gateway status."}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={recovering}
          onClick={() => void retryGatewayStatus()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Retry
        </Button>
      </>
    );
  } else if (gateway.phase === "locked") {
    control = (
      <Button size="sm" variant="outline" className="h-8" onClick={() => setUnlockOpen(true)}>
        <KeyRound className="h-3.5 w-3.5 mr-1.5" aria-hidden />
        {gateway.expired ? "Session expired · Unlock" : "Unlock gateway"}
      </Button>
    );
  } else if (!gateway.status.configured || gateway.status.models.length === 0) {
    configError = gateway.status.configError;
    control = setupButton(configError ?? "The gateway is not configured.");
  } else {
    const { status } = gateway;
    const connection = status.connections[activeModel];
    const checking =
      checkingModels.includes(activeModel) || checkingModels.includes("__default__");
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
        <>
          <Badge
            variant="outline"
            className={allowBadge}
            title={`verified ${verifiedTime(connection.lastVerifiedAt)}`}
          >
            Connected — {status.providerLabel} · {activeModel}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => void verifyGatewayModel(activeModel)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Test connection
          </Button>
        </>
      );
    } else if (connection?.state === "failed") {
      // A rejected or under-privileged key cannot be fixed by retrying: say what to do.
      const keyProblem = /key/i.test(connection.error ?? "");
      badge = (
        <>
          <Badge variant="outline" className={blockBadge} title={connection.error}>
            Connection failed — {connection.error ?? "unknown reason"}
          </Badge>
          {keyProblem && (
            <span className="text-xs text-muted-foreground">
              Fix the key in your server&apos;s configuration, restart, refresh this page and
              unlock again. <SetupStepsLink />
            </span>
          )}
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
      <SetupGatewayDialog open={setupOpen} onOpenChange={setSetupOpen} configError={configError} />
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Suggests an unlock phrase and links to the setup steps. Makes no request: the phrase is
 * only a suggestion until the operator writes it into the server's configuration.
 */
function SetupGatewayDialog({
  open,
  onOpenChange,
  configError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configError?: string;
}) {
  const [phrase, setPhrase] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && !phrase) setPhrase(suggestUnlockPhrase());
    if (!open) setCopied(false);
  }, [open, phrase]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up gateway</DialogTitle>
          <DialogDescription>
            Add your proprietary LLM API key and an unlock phrase to your server&apos;s
            configuration, then restart. Here is a phrase you can use. It protects nothing
            until you put it in your server&apos;s configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label htmlFor="suggested-phrase" className="text-sm font-medium">
            Suggested unlock phrase
          </label>
          <div className="flex gap-2">
            <Input
              id="suggested-phrase"
              readOnly
              value={phrase}
              className="font-mono"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              onClick={async () => setCopied(await copyText(phrase))}
              aria-label="Copy phrase"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPhrase(suggestUnlockPhrase());
                setCopied(false);
              }}
            >
              New phrase
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            The steps for every way of running JurisCore, including the downloaded package and
            the container, are in one place: <SetupStepsLink />.
          </p>
          {configError && (
            <p role="alert" className="text-sm text-[color:var(--block)]">
              Server reports: {configError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sends the unlock phrase once to exchange it for an HttpOnly session cookie. It is not a
 * provider credential, and the page does not keep it after submitting. On plain HTTP from
 * another machine the dialog refuses before anything is typed (the cookie could never be
 * stored there, and the phrase must not travel in the clear).
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
  const blocked =
    typeof window !== "undefined" &&
    unlockBlockedByLocation({
      protocol: window.location.protocol,
      hostname: window.location.hostname,
    });

  const close = (next: boolean) => {
    if (!next) {
      setToken("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (blocked || !token.trim()) return;
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
              Enter the unlock phrase you put in your server&apos;s configuration as{" "}
              <code>JURISCORE_GATEWAY_TOKEN</code>. This is not your API key; the key stays on
              the server. <SetupStepsLink />
            </DialogDescription>
          </DialogHeader>
          {blocked ? (
            <p role="alert" className="text-sm text-[color:var(--revise)]">
              The gateway can be unlocked only from a browser on the server&apos;s own machine,
              at http://localhost:{window.location.port || "8080"}. See Setup steps.
            </p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="gateway-token" className="text-sm font-medium">
                Unlock phrase
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
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={blocked || busy || !token.trim()}>
              {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
