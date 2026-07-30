import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plug } from "lucide-react";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Connect via MCP — JurisCore AI" },
      { name: "description", content: "Plug JurisCore into ChatGPT, Claude, Cursor, or any MCP-aware assistant." },
    ],
  }),
  component: Connect,
});

const tools = [
  { name: "check_prompt", desc: "Input guardrail — PII/PHI scan, prompt-injection detection." },
  { name: "retrieve_policy", desc: "Fetch relevant clauses from a domain rulebook (SEC/FINRA/HIPAA/CMS)." },
  { name: "enforce_citations", desc: "Verify every regulatory claim is grounded in an approved clause." },
  { name: "evaluate_response", desc: "End-to-end: run all four pipeline stages on a prompt + draft." },
  { name: "get_audit_entry", desc: "Fetch the full chain of checks for a prior interaction by ID." },
  { name: "get_metrics", desc: "Governance KPI snapshot: violation rate, accuracy, latency." },
];

const clients = [
  {
    name: "Claude Desktop",
    config: `{
  "mcpServers": {
    "juriscore": {
      "url": "https://<your-app>.lovable.app/mcp"
    }
  }
}`,
  },
  {
    name: "Cursor",
    config: `// ~/.cursor/mcp.json
{
  "mcpServers": {
    "juriscore": { "url": "https://<your-app>.lovable.app/mcp" }
  }
}`,
  },
  {
    name: "ChatGPT (Custom Connector)",
    config: `Server URL:
  https://<your-app>.lovable.app/mcp

Authentication: None (public demo)`,
  },
];

function Connect() {
  return (
    <div className="min-h-dvh p-0 md:p-4 lg:p-6" style={{ background: "var(--app-bg)" }}>
      <a href="#connect-main" className="skip-link">Skip to main content</a>
      <div className="bg-card md:rounded-2xl md:shadow-[0_20px_60px_-20px_oklch(0.2_0.05_285/0.35)] overflow-hidden">
        <header className="border-b border-border/60 bg-card/90 backdrop-blur">
          <div className="mx-auto max-w-5xl px-6 h-16 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <Link to="/" aria-label="JurisCore AI — home" className="flex min-w-0 items-center gap-2 font-semibold">
              <span aria-hidden="true" className="inline-block h-6 w-6 shrink-0 rounded-sm bg-primary" />
              <span className="truncate">JurisCore <span className="text-primary">AI</span></span>
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard"><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> Dashboard</Link>
            </Button>
          </div>
        </header>

        <main id="connect-main" className="mx-auto max-w-5xl px-6 py-12 sm:py-16 space-y-12">
          <div>
            <Badge className="mb-4"><Plug className="mr-1 h-3 w-3" /> MCP Server · public</Badge>
            <h1 className="page-title text-4xl">Connect JurisCore to your assistant</h1>
            <p className="page-sub">
              JurisCore exposes its guardrail pipeline as a Model Context Protocol server at
              {" "}<code className="font-mono text-primary">/mcp</code>. Any MCP-aware assistant can call the tools below.
            </p>
          </div>

          <section>
            <div className="eyebrow mb-3">Available tools</div>
            <div className="grid md:grid-cols-2 gap-3">
              {tools.map((t) => (
                <div key={t.name} className="rounded-2xl border border-border bg-card p-4 card-shadow">
                  <div className="font-mono text-sm text-primary">{t.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="eyebrow mb-3">Client configuration</div>
            <div className="grid md:grid-cols-3 gap-3">
              {clients.map((c) => (
                <Card key={c.name}>
                  <CardHeader><CardTitle className="text-sm">{c.name}</CardTitle></CardHeader>
                  <CardContent>
                    <pre className="font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-5 text-foreground/85">{c.config}</pre>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Replace <code className="font-mono">&lt;your-app&gt;</code> with the published URL of this project.
              Since this is a public MCP server, no authentication is required — anyone with the URL can call these
              (mock) tools.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
