import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, GitBranch, FileCheck, ScrollText, ArrowRight, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: Landing,
});

const stages = [
  { icon: Shield, name: "Screen the question", desc: "Remove names, SSNs, medical IDs, and API keys before anything reaches the AI. Block sneaky prompts." },
  { icon: GitBranch, name: "Find the rule", desc: "Pull the exact clause from your rulebook — SEC, FINRA, HIPAA, or CMS — that applies to this request." },
  { icon: FileCheck, name: "Check the answer", desc: "Every claim in the reply must trace back to that clause. If it can't, we rewrite or block it." },
  { icon: ScrollText, name: "Keep the receipt", desc: "A tamper-proof log any auditor or regulator can read in minutes, not days." },
];

function Landing() {
  return (
    <div className="min-h-dvh p-0 md:p-4 lg:p-6" style={{ background: "var(--app-bg)" }}>
      <a href="#main" className="skip-link">Skip to main content</a>

      <div className="bg-card md:rounded-2xl md:shadow-[0_20px_60px_-20px_oklch(0.2_0.05_285/0.35)] overflow-hidden">
        <header className="border-b border-border/60 sticky top-0 z-40 bg-card/90 backdrop-blur">
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
              Trust layer for AI in regulated work
            </Badge>
            <h1 id="hero-title" className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-tight max-w-4xl leading-[1.05] text-balance">
              Stop your AI from saying things it shouldn't.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl text-pretty">
              JurisCore checks every AI message — before it's sent and before it's shown — against your real
              policies. Bad answers get blocked, private data gets scrubbed, and every decision leaves a receipt.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/dashboard/gateway">
                  See it in action <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/connect"><Plug aria-hidden="true" className="mr-2 h-4 w-4" /> Connect your AI tools</Link>
              </Button>
            </div>

            <dl className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl">
              <Stat label="Bad answers caught" before="—" after="7 in 100" />
              <Stat label="Audit ready in" before="Days" after="Minutes" />
              <Stat label="New AI features shipped in" before="47 days" after="6 days" />
              <Stat label="Correct calls" before="—" after="97%" />
            </dl>
          </section>

          <section aria-labelledby="pipeline-title" className="border-t border-border/60 bg-secondary/40">
            <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
              <div className="max-w-2xl">
                <div className="eyebrow mb-2">How it works</div>
                <h2 id="pipeline-title" className="page-title text-3xl md:text-4xl">
                  How a single question travels through JurisCore.
                </h2>
                <p className="page-sub">
                  Four checks, under a second. Nothing reaches your users until every one passes.
                </p>
              </div>
              <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stages.map((s, i) => (
                  <li key={s.name} className="relative rounded-2xl border border-border bg-card p-6 card-shadow">
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
                <Badge variant="secondary" className="mb-4">Works with your existing AI tools</Badge>
                <h2 id="mcp-title" className="page-title text-3xl md:text-4xl">
                  Plug it into ChatGPT, Claude, or Cursor.
                </h2>
                <p className="page-sub">
                  Any assistant that supports the Model Context Protocol (MCP) can ask JurisCore for
                  permission before answering anything sensitive — check the prompt, look up the rule,
                  and prove the answer is backed by a real policy.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild><Link to="/connect">Connection guide</Link></Button>
                  <Button asChild variant="outline"><Link to="/dashboard/rulebooks">See the rules</Link></Button>
                </div>
              </div>
              <figure className="rounded-2xl border border-border bg-card p-6 font-mono text-xs overflow-x-auto card-shadow">
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
    </div>
  );
}

function Stat({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="stat-value mt-2">{after}</dd>
      <dd className="text-xs text-muted-foreground font-mono">was {before}</dd>
    </div>
  );
}
