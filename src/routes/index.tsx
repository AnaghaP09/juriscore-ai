import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  EyeOff,
  FileCheck,
  GitBranch,
  GitPullRequest,
  Plug,
  ScrollText,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

const stages = [
  {
    icon: Shield,
    name: "Screen the input",
    desc: "Apply the selected policy before content reaches the model. Detect sensitive categories, secrets, and prompt attacks.",
  },
  {
    icon: GitBranch,
    name: "Transform or block",
    desc: "Redact or tokenize prohibited values, preserve permitted context, and stop the request when policy requires it.",
  },
  {
    icon: FileCheck,
    name: "Validate the assertion",
    desc: "Compare material claims with the authoritative source. Return matches, drift, or cannot determine with references.",
  },
  {
    icon: ScrollText,
    name: "Keep the receipt",
    desc: "Return a structured verdict and evidence record that the application can review, store, or enforce.",
  },
];

const features = [
  {
    icon: EyeOff,
    eyebrow: "Veil",
    title: "Protect what goes in",
    description:
      "Detect and transform configured sensitive information before it reaches an AI model, then expose a reviewable transformation receipt.",
    to: "/dashboard/redaction" as const,
    action: "Open Veil",
  },
  {
    icon: GitPullRequest,
    eyebrow: "Plumb",
    title: "Prove what comes out",
    description:
      "Compare documentation and product assertions with code, configuration, schemas, and APIs. Return matches, drift, or cannot determine with citations.",
    to: "/dashboard/drift" as const,
    action: "Open Plumb",
  },
];

function Landing() {
  return (
    <div className="min-h-dvh p-0 md:p-4 lg:p-6" style={{ background: "var(--app-bg)" }}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <div className="bg-card md:rounded-2xl md:shadow-[0_20px_60px_-20px_oklch(0.2_0.05_285/0.35)] overflow-hidden">
        <header className="border-b border-border/60 sticky top-0 z-40 bg-card/90 backdrop-blur">
          <div className="mx-auto max-w-7xl px-6 h-16 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <Link
              to="/"
              aria-label="JurisCore home"
              className="flex min-w-0 items-center gap-2 font-semibold tracking-tight"
            >
              <span
                aria-hidden="true"
                className="inline-block h-6 w-6 shrink-0 rounded-sm bg-primary"
              />
              <span className="truncate">JurisCore</span>
            </Link>
            <nav
              aria-label="Primary"
              className="flex items-center gap-2 sm:gap-6 text-sm text-muted-foreground"
            >
              <Link
                to="/dashboard"
                className="hidden sm:inline-block hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <Link
                to="/connect"
                className="hidden sm:inline-block hover:text-foreground transition-colors"
              >
                Connect
              </Link>
              <Button asChild size="sm">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            </nav>
          </div>
        </header>

        <main id="main">
          <section
            aria-labelledby="hero-title"
            className="mx-auto max-w-7xl px-6 pt-16 md:pt-24 pb-20"
          >
            <Badge variant="outline" className="mb-6 border-primary/40 text-primary">
              AI validation platform · Free to start
            </Badge>
            <h1
              id="hero-title"
              className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-tight max-w-4xl leading-[1.05] text-balance"
            >
              Protect the prompt. Prove the answer.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl text-pretty">
              JurisCore is the control plane around your AI workflows. Veil protects sensitive
              inputs before a model sees them. Plumb validates important assertions against the
              implemented source of truth. Every check returns an allow, revise, or block decision
              with evidence.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/dashboard/redaction">
                  Try Veil <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/dashboard/drift">Try Plumb</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/connect">
                  <Plug aria-hidden="true" className="mr-2 h-4 w-4" /> Connect your AI tools
                </Link>
              </Button>
            </div>

            <dl className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl">
              <Stat label="Input control" value="Detect · transform" note="Veil" />
              <Stat label="Source validation" value="Match · drift" note="Plumb" />
              <Stat label="Decision contract" value="Allow · revise · block" note="Shared" />
              <Stat label="Traceability" value="Evidence + receipt" note="Shared" />
            </dl>
          </section>

          <section aria-labelledby="features-title" className="border-t border-border/60">
            <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
              <div className="max-w-2xl">
                <div className="eyebrow mb-2">Two features, one platform</div>
                <h2 id="features-title" className="page-title text-3xl md:text-4xl">
                  Apply the same policy before and after AI.
                </h2>
                <p className="page-sub">
                  Veil and Plumb are JurisCore features. They share a policy library, verdicts,
                  evidence references, review controls, and audit receipts.
                </p>
              </div>
              <div className="mt-10 grid md:grid-cols-2 gap-4">
                {features.map((feature) => (
                  <article
                    key={feature.eyebrow}
                    className="rounded-2xl border border-border bg-card p-6 card-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary/15 flex items-center justify-center">
                        <feature.icon className="h-5 w-5 text-primary" aria-hidden />
                      </div>
                      <div>
                        <div
                          className="eyebrow"
                        >
                          {feature.eyebrow}
                        </div>
                        <h3 className="font-semibold text-lg">{feature.title}</h3>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">{feature.description}</p>
                    <Button asChild variant="outline" className="mt-6">
                      <Link to={feature.to}>
                        {feature.action}
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="plans-title" className="border-t border-border/60">
            <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
              <div className="max-w-2xl">
                <div className="eyebrow mb-2">Product-led, usage-based</div>
                <h2 id="plans-title" className="page-title text-3xl md:text-4xl">
                  Start free. Pay when JurisCore becomes infrastructure.
                </h2>
                <p className="page-sub">
                  Explore the core workflow at no cost, then add shared governance, automation,
                  and enterprise controls as usage grows.
                </p>
              </div>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                <Plan
                  name="Free"
                  description="Local playground, built-in policy references, and limited Veil and Plumb checks."
                />
                <Plan
                  name="Team"
                  description="Usage-based API, custom policies, shared receipts, CI checks, and collaboration."
                />
                <Plan
                  name="Enterprise"
                  description="SSO, RBAC, private policy packs, dedicated data controls, and priority support."
                />
              </div>
            </div>
          </section>

          <section
            aria-labelledby="pipeline-title"
            className="border-t border-border/60 bg-secondary/40"
          >
            <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
              <div className="max-w-2xl">
                <div className="eyebrow mb-2">How it works</div>
                <h2 id="pipeline-title" className="page-title text-3xl md:text-4xl">
                  One validation contract around every model.
                </h2>
                <p className="page-sub">
                  The application selects the policy. JurisCore returns a verdict, findings, and
                  evidence.
                </p>
              </div>
              <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stages.map((stage, index) => (
                  <li
                    key={stage.name}
                    className="relative rounded-2xl border border-border bg-card p-6 card-shadow"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div
                        aria-hidden="true"
                        className="h-10 w-10 rounded-md bg-primary/15 flex items-center justify-center"
                      >
                        <stage.icon className="h-5 w-5 text-primary" />
                      </div>
                      <span
                        aria-label={`Stage ${index + 1} of 4`}
                        className="font-mono text-xs text-muted-foreground"
                      >
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="font-semibold">{stage.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{stage.desc}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section aria-labelledby="mcp-title" className="border-t border-border/60">
            <div className="mx-auto max-w-7xl px-6 py-20 md:py-24 grid md:grid-cols-2 gap-12 items-center">
              <div>
                <Badge variant="secondary" className="mb-4">
                  Works with existing AI tools
                </Badge>
                <h2 id="mcp-title" className="page-title text-3xl md:text-4xl">
                  Connect through an API or MCP.
                </h2>
                <p className="page-sub">
                  Applications and compatible assistants can ask JurisCore to screen an input,
                  retrieve a policy, validate an assertion, and return a structured decision before
                  taking action.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/connect">Connection guide</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/dashboard/rulebooks">Open Policy Library</Link>
                  </Button>
                </div>
              </div>
              <figure className="rounded-2xl border border-border bg-card p-6 font-mono text-xs overflow-x-auto card-shadow">
                <figcaption className="text-muted-foreground mb-2">
                  MCP server configuration
                </figcaption>
                <pre
                  aria-label="Example MCP server configuration"
                  className="text-foreground/90 leading-6"
                >{`{
  "mcpServers": {
    "juriscore": {
      "url": "https://<your-app>.lovable.app/mcp"
    }
  }
}`}</pre>
              </figure>
            </div>
          </section>
        </main>

        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-muted-foreground flex flex-wrap gap-2 justify-between">
            <span>JurisCore · Commercial platform prototype · Synthetic and mock data</span>
            <span className="font-mono">v1 platform</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Plan({ name, description }: { name: string; description: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-6 card-shadow">
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2 text-lg font-semibold tracking-tight">{value}</dd>
      <dd className="text-xs text-muted-foreground font-mono">{note}</dd>
    </div>
  );
}
