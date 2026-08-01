import { useEffect, useState } from "react";
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
  {
    name: "check_prompt",
    status: "live" as const,
    desc: "Runs the Veil engine over text before it reaches a model. Returns allow, revise, or block with finding categories, severities, and counts.",
  },
  {
    name: "retrieve_policy",
    status: "live" as const,
    desc: "Reads this instance's policy catalog: pack ids, versions, issuing authorities, and sources.",
  },
  {
    name: "compare_claims",
    status: "live" as const,
    desc: "Runs the Plumb engine over structured claims. Returns matches, drifted, or cannot determine with both source references.",
  },
  {
    name: "evaluate_response",
    status: "live" as const,
    desc: "Veil on the prompt, Veil on the draft, and the Plumb comparison when structured claims are supplied.",
  },
  {
    name: "enforce_citations",
    status: "unavailable" as const,
    desc: "Not implemented. Citation enforcement over prose needs claim extraction and a clause-level policy index; the call fails closed rather than return a coverage figure nobody measured.",
  },
  {
    name: "get_audit_entry",
    status: "unavailable" as const,
    desc: "Not implemented. Receipts are returned to the operator and not persisted server-side, so there is no store to look an id up in.",
  },
];

const upcomingProviders = [
  { name: "Anthropic Claude", detail: "API + Claude Desktop" },
  { name: "OpenAI", detail: "GPT API + ChatGPT" },
  { name: "Azure OpenAI", detail: "Azure-hosted deployments" },
  { name: "Google Gemini", detail: "Gemini API + Vertex AI" },
];

// The MCP endpoint is always `/mcp` on the origin serving this instance, so the
// configuration snippets are built from that origin rather than a hosted URL.
// Server rendering has no origin, so the placeholder stands until the page mounts.
const ORIGIN_PLACEHOLDER = "https://<your-host>";

function clientConfigs(origin: string) {
  const endpoint = `${origin}/mcp`;
  return [
    {
      name: "Claude Desktop",
      config: `{
  "mcpServers": {
    "juriscore": {
      "url": "${endpoint}"
    }
  }
}`,
    },
    {
      name: "Cursor",
      config: `// ~/.cursor/mcp.json
{
  "mcpServers": {
    "juriscore": { "url": "${endpoint}" }
  }
}`,
    },
    {
      name: "ChatGPT (Custom Connector)",
      config: `Server URL:
  ${endpoint}

Authentication: none — this build has none to configure.`,
    },
  ];
}

function Connect() {
  const [origin, setOrigin] = useState(ORIGIN_PLACEHOLDER);
  useEffect(() => setOrigin(window.location.origin), []);
  const clients = clientConfigs(origin);

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
              JurisCore exposes the Veil and Plumb engines as a Model Context Protocol server at
              {" "}<code className="font-mono text-primary">/mcp</code> on whichever origin serves this instance.
              Any MCP-aware assistant can call the tools below. Evaluation runs locally: no tool makes an
              external call, and no tool returns a detected value or the text you submitted.
            </p>
          </div>

          <section>
            <div className="eyebrow mb-3">Available tools</div>
            <div className="grid md:grid-cols-2 gap-3">
              {tools.map((t) => (
                <div key={t.name} className="rounded-2xl border border-border bg-card p-4 card-shadow">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-primary">{t.name}</span>
                    {t.status === "unavailable" && (
                      <Badge variant="secondary" className="text-[10px]">Not implemented</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="eyebrow mb-3">Model connections — roadmap</div>
            <div className="rounded-2xl border border-border bg-card p-4 card-shadow">
              <p className="text-sm text-muted-foreground">
                The JurisCore gateway will route checked context to approved proprietary providers through Veil,
                with server-side credentials and a receipt for every exchange. No connection is simulated: these
                remain disabled until a real gateway connection exists.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {upcomingProviders.map((p) => (
                  <Button key={p.name} variant="outline" size="sm" disabled title={`${p.detail} — coming soon`}>
                    {p.name}
                    <Badge variant="secondary" className="ml-2 text-[10px]">Coming soon</Badge>
                  </Button>
                ))}
              </div>
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
              The endpoint is <code className="font-mono">/mcp</code> on the origin serving this JurisCore
              instance — <code className="font-mono">{origin}/mcp</code> here. On a self-hosted install that is
              your own host; substitute it wherever the snippets show
              {" "}<code className="font-mono">{ORIGIN_PLACEHOLDER}</code>.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong className="text-foreground">This server has no authentication.</strong> None is implemented
              in this build, so anyone who can reach the URL can call every live tool. Bind it to a network you
              control. The tools run the real Veil and Plumb engines and return verdicts, finding categories, and
              counts — never a detected value, the sanitized text, or the text you submitted — but the calls
              themselves are unauthenticated and unmetered.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
