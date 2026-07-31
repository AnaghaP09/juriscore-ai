import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, FilePlus2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { useDemoStore } from "@/lib/juriscore/demo-store";
import {
  BUILT_IN_POLICIES,
  type PolicyDefinition,
} from "@/lib/juriscore/policies/catalog";

export const Route = createFileRoute("/dashboard/rulebooks")({
  head: () => ({
    meta: [
      { title: "Policy Library — JurisCore" },
      {
        name: "description",
        content: "Activate built-in policy references or add organizational AI policies.",
      },
    ],
  }),
  component: PolicyLibrary,
});

const emptyForm = {
  name: "",
  authority: "",
  version: "1.0",
  url: "",
  description: "",
};

function PolicyLibrary() {
  const {
    activePolicyIds,
    setPolicyActive,
    customPolicies,
    addCustomPolicy,
  } = useDemoStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const policies = useMemo(
    () => [...BUILT_IN_POLICIES, ...customPolicies],
    [customPolicies],
  );

  const createPolicy = () => {
    const id = `custom.${form.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}.${Date.now()}`;
    const policy: PolicyDefinition = {
      id,
      name: form.name.trim(),
      shortName: form.name.trim(),
      version: form.version.trim() || "1.0",
      authority: form.authority.trim() || "Your organization",
      description: form.description.trim(),
      features: ["veil", "plumb"],
      veilScopes: ["common", "secrets"],
      defaultActive: true,
      custom: true,
      source: {
        title: form.name.trim(),
        publisher: form.authority.trim() || "Your organization",
        url: form.url.trim() || "about:blank",
        retrievedAt: new Date().toISOString().slice(0, 10),
      },
    };
    addCustomPolicy(policy);
    setForm(emptyForm);
    setDialogOpen(false);
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Shared policy control plane"
        icon={<BookOpen className="h-6 w-6" aria-hidden />}
        title="Policy Library"
        description="Choose the policy references JurisCore applies across Veil and Plumb. Add internal rules beside the built-in packs."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <FilePlus2 className="mr-2 h-4 w-4" aria-hidden /> Add custom policy
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add an organizational policy</DialogTitle>
                <DialogDescription>
                  Custom policies are stored in this browser for the prototype and activated for
                  both Veil and Plumb.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="policy-name">Policy name</Label>
                  <Input
                    id="policy-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Production AI data-handling policy"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="policy-owner">Owner or authority</Label>
                    <Input
                      id="policy-owner"
                      value={form.authority}
                      onChange={(event) => setForm({ ...form, authority: event.target.value })}
                      placeholder="Security Engineering"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="policy-version">Version</Label>
                    <Input
                      id="policy-version"
                      value={form.version}
                      onChange={(event) => setForm({ ...form, version: event.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="policy-url">Authoritative source URL</Label>
                  <Input
                    id="policy-url"
                    type="url"
                    value={form.url}
                    onChange={(event) => setForm({ ...form, url: event.target.value })}
                    placeholder="https://intranet.example/policies/ai-data"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="policy-rules">Evaluation instructions</Label>
                  <Textarea
                    id="policy-rules"
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Describe what Veil must protect and what evidence Plumb must require."
                    rows={5}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={createPolicy}
                  disabled={!form.name.trim() || !form.description.trim()}
                >
                  Save and activate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="border-[color:var(--revise)]/30 bg-[color:var(--revise)]/[0.04]">
        <CardContent className="flex items-start gap-3 pt-5 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--revise)]" />
          <p>
            These packs translate authoritative references into configurable checks. Activation is
            not certification, legal advice, or proof of compliance. Applicability and control
            effectiveness still require qualified review.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {policies.map((policy) => {
          const active = activePolicyIds.includes(policy.id);
          return (
            <Card key={policy.id} className={active ? "border-primary/40" : undefined}>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">{policy.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {policy.authority} · {policy.version}
                    </p>
                  </div>
                  <Switch
                    checked={active}
                    onCheckedChange={(checked) => setPolicyActive(policy.id, checked)}
                    aria-label={`${active ? "Deactivate" : "Activate"} ${policy.name}`}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {policy.custom ? <Badge>Custom</Badge> : <Badge variant="secondary">Built in</Badge>}
                  {policy.features.map((feature) => (
                    <Badge key={feature} variant="outline" className="capitalize">
                      {feature}
                    </Badge>
                  ))}
                  <Badge variant="outline">{active ? "Active" : "Available"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{policy.description}</p>
                {policy.source.url === "about:blank" ? (
                  <span className="text-xs text-muted-foreground">No source URL supplied</span>
                ) : (
                  <a
                    href={policy.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    {policy.source.title}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm">
        <span>
          {activePolicyIds.length} active policies will be attached to new Veil and Plumb receipts.
        </span>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/redaction">Open Veil</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/drift">Open Plumb</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
