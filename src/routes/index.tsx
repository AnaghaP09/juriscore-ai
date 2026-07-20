import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, GitBranch, FileCheck, ScrollText, ArrowRight, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: Landing,
});

const stages = [
  { icon: Shield, name: "Input Guardrails", desc: "Strips PII/PHI and screens for prompt injection before anything reaches the model." },
  { icon: GitBranch, name: "RAG Core", desc: "Policy Orchestrator queries the correct domain Rulebook — SEC, FINRA, HIPAA, CMS." },
  { icon: FileCheck, name: "Output Guardrails", desc: "Every response must map back to an approved source. Citation Enforcement blocks hallucinations." },
  { icon: ScrollText, name: "Audit Log", desc: "Immutable ledger paired with a human feedback loop. Regulator-ready in minutes." },
];

function Landing() {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">Skip to main content</a>

      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="mx-auto max-w-7xl px-6 h-16 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <Link to="/" aria-label="JurisCore AI — home" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden="true" className="inline-block h-6 w-6 shrink-0 rounded-sm bg-primary" />
            <span className="truncate">JurisCore <span className="text-primary">AI</span></span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-6 text-sm text-muted-foreground">
            <Link to="/dashboard" className="hidden sm:inline-block hover:text-foreground transition-colors">Dashboard</Link>
            <Link to="/connect" className="hidden sm:inline-block hover:text-foreground transition-colors">Connect</Link>
            <Button asChild size="sm"><Link to="/dashboard">Open dashboard</Link></Button>
          </nav>
        </div>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="mx-auto max-w-7xl px-6 pt-16 md:pt-24 pb-20">
          <Badge variant="outline" className="mb-6 border-primary/40 text-primary">
            EU AI Act high-risk rules — August 2, 2026
          </Badge>
          <h1 id="hero-title" className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-tight max-w-4xl leading-[1.05] text-balance">
            The compliance layer between your AI and the regulator.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl text-pretty">
            JurisCore AI is a universal governance middleware. It decouples compliance logic from AI functionality
            so teams in Finance and Healthcare ship AI with confidence, not fear.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/dashboard/gateway">
                Try the live gateway <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link to="/connect"><Plug aria-hidden="true" className="mr-2 h-4 w-4" /> Connect via MCP</Link>
            </Button>
          </div>


          <dl className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl">
            <Stat label="Time-to-ship" before="47 days" after="6 days" />
            <Stat label="Audit prep" before="Days" after="Minutes" />
            <Stat label="Guardrail accuracy" before="—" after="97.3%" />
            <Stat label="Violations blocked" before="—" after="7.1%" />
          </dl>
        </section>

        <section aria-labelledby="pipeline-title" className="border-t border-border/60 bg-card/30">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <div className="max-w-2xl">
              <h2 id="pipeline-title" className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
                A mandatory safety-and-logic gate.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Every request flows through four stages before a response ever leaves the system.
              </p>
            </div>
            <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {stages.map((s, i) => (
                <li key={s.name} className="relative rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div aria-hidden="true" className="h-10 w-10 rounded-md bg-primary/15 flex items-center justify-center">
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span aria-label={`Stage ${i + 1} of 4`} className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  </div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="mcp-title" className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24 grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4">MCP Server</Badge>
              <h2 id="mcp-title" className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
                Plug it into ChatGPT, Claude, or Cursor.
              </h2>
              <p className="mt-4 text-muted-foreground text-pretty">
                JurisCore ships as a Model Context Protocol server. Any MCP-aware assistant can call
                its guardrail tools — <code className="font-mono text-primary">check_prompt</code>,
                {" "}<code className="font-mono text-primary">retrieve_policy</code>, {" "}
                <code className="font-mono text-primary">enforce_citations</code> — before responding to a user.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild><Link to="/connect">Connection guide</Link></Button>
                <Button asChild variant="outline"><Link to="/dashboard/rulebooks">View rulebooks</Link></Button>
              </div>
            </div>
            <figure className="rounded-xl border border-border bg-card p-6 font-mono text-xs overflow-x-auto">
              <figcaption className="text-muted-foreground mb-2">claude_desktop_config.json</figcaption>
              <pre aria-label="Example MCP server configuration" className="text-foreground/90 leading-6">{`{
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
          <span>JurisCore AI · Demo build · Mock data</span>
          <span className="font-mono">v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold">{after}</dd>
      <dd className="text-xs text-muted-foreground font-mono">was {before}</dd>
    </div>
  );
}
