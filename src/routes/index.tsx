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
    <div className="min-h-screen">
      {/* Nav */}
      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-6 w-6 rounded-sm bg-primary" />
            <span>JurisCore <span className="text-primary">AI</span></span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <Link to="/connect" className="hover:text-foreground transition-colors">Connect</Link>
            <Button asChild size="sm"><Link to="/dashboard">Open dashboard</Link></Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pt-24 pb-20">
        <Badge variant="outline" className="mb-6 border-primary/40 text-primary">
          EU AI Act high-risk rules — August 2, 2026
        </Badge>
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight max-w-4xl leading-[1.05]">
          The compliance layer between your AI and the regulator.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
          JurisCore AI is a universal governance middleware. It decouples compliance logic from AI functionality
          so teams in Finance and Healthcare ship AI with confidence, not fear.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/dashboard">
              Open governance dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/connect"><Plug className="mr-2 h-4 w-4" /> Connect via MCP</Link>
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl">
          <Stat label="Time-to-ship" before="47 days" after="6 days" />
          <Stat label="Audit prep" before="Days" after="Minutes" />
          <Stat label="Guardrail accuracy" before="—" after="97.3%" />
          <Stat label="Violations blocked" before="—" after="7.1%" />
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              A mandatory safety-and-logic gate.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every request flows through four stages before a response ever leaves the system.
            </p>
          </div>
          <div className="mt-12 grid md:grid-cols-4 gap-4">
            {stages.map((s, i) => (
              <div key={s.name} className="relative rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-md bg-primary/15 flex items-center justify-center">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plugin callout */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="secondary" className="mb-4">MCP Server</Badge>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Plug it into ChatGPT, Claude, or Cursor.
            </h2>
            <p className="mt-4 text-muted-foreground">
              JurisCore ships as a Model Context Protocol server. Any MCP-aware assistant can call
              its guardrail tools — <code className="font-mono text-primary">check_prompt</code>,
              {" "}<code className="font-mono text-primary">retrieve_policy</code>, {" "}
              <code className="font-mono text-primary">enforce_citations</code> — before responding to a user.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild><Link to="/connect">Connection guide</Link></Button>
              <Button asChild variant="outline"><Link to="/dashboard/rulebooks">View rulebooks</Link></Button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 font-mono text-xs overflow-x-auto">
            <div className="text-muted-foreground mb-2">// claude_desktop_config.json</div>
            <pre className="text-foreground/90 leading-6">{`{
  "mcpServers": {
    "juriscore": {
      "url": "https://<your-app>.lovable.app/mcp"
    }
  }
}`}</pre>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-muted-foreground flex justify-between">
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
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{after}</div>
      <div className="text-xs text-muted-foreground font-mono">was {before}</div>
    </div>
  );
}
