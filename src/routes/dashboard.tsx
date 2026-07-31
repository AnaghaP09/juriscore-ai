import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Layers,
  ScrollText,
  BookOpen,
  Plug,
  ArrowLeft,
  Zap,
  GitPullRequest,
  EyeOff,
  ShieldAlert,
  Activity,
  RotateCcw,
  Inbox,
  Briefcase,
  FileSignature,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODELS, useDemoStore, type ModelId } from "@/lib/juriscore/demo-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — JurisCore AI" },
      {
        name: "description",
        content: "Legal operations cockpit — matters, contracts, hearings, and AI review.",
      },
    ],
  }),
  component: DashboardLayout,
});

const groups: Array<{
  label: string;
  items: Array<{
    to: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
  }>;
}> = [
  {
    label: "JurisCore",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
      { to: "/dashboard/redaction", label: "Veil · Privacy", icon: EyeOff },
      { to: "/dashboard/drift", label: "Plumb · Drift", icon: GitPullRequest },
    ],
  },
  {
    label: "Work",
    items: [
      { to: "/dashboard/intake", label: "Intake", icon: Inbox },
      { to: "/dashboard/matters", label: "Matters", icon: Briefcase },
      { to: "/dashboard/contracts", label: "Contracts", icon: FileSignature },
      { to: "/dashboard/hearings", label: "Hearings", icon: CalendarClock },
      { to: "/dashboard/ai-review", label: "AI Review", icon: Sparkles },
    ],
  },
  {
    label: "AI Governance",
    items: [
      { to: "/dashboard/analytics", label: "Analytics", icon: LayoutDashboard },
      { to: "/dashboard/use-cases", label: "Use Cases", icon: Layers },
      { to: "/dashboard/audit", label: "Audit Log", icon: ScrollText },
      { to: "/dashboard/rulebooks", label: "Rulebooks", icon: BookOpen },
      { to: "/dashboard/ciso", label: "CISO Gateway", icon: ShieldAlert },
    ],
  },
  {
    label: "Live Demo",
    items: [
      { to: "/dashboard/gateway", label: "LLM Gateway", icon: Zap },
      { to: "/dashboard/pipeline", label: "Pipeline", icon: Activity },
    ],
  },
];

function DashboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeModel, setActiveModel, killSwitch, resetDemo } = useDemoStore();

  return (
    <div className="min-h-dvh p-0 md:p-4 lg:p-6" style={{ background: "var(--app-bg)" }}>
      <a href="#dashboard-main" className="skip-link">
        Skip to main content
      </a>
      <div className="min-h-[calc(100dvh-3rem)] flex flex-col md:flex-row overflow-hidden bg-card md:rounded-2xl md:shadow-[0_20px_60px_-20px_oklch(0.2_0.05_285/0.35)]">
        <aside
          aria-label="Dashboard navigation"
          className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border/60 bg-sidebar shrink-0 flex md:flex-col"
        >
          <div className="h-16 flex items-center px-5 border-b border-border/60 md:w-full">
            <Link
              to="/"
              aria-label="JurisCore AI — home"
              className="flex items-center gap-2 font-semibold"
            >
              <span aria-hidden="true" className="inline-block h-6 w-6 rounded-sm bg-primary" />
              <span>
                JurisCore <span className="text-primary">AI</span>
              </span>
            </Link>
          </div>
          <nav
            aria-label="Dashboard sections"
            className="p-3 flex-1 flex md:block gap-1 md:space-y-4 overflow-x-auto"
          >
            {groups.map((g) => (
              <div key={g.label} className="md:space-y-1">
                <div className="hidden md:block px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                  {g.label}
                </div>
                {g.items.map((n) => {
                  const active = n.exact
                    ? pathname === n.to
                    : pathname === n.to ||
                      (n.to !== "/dashboard" && pathname.startsWith(n.to + "/"));
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors whitespace-nowrap",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
                      )}
                    >
                      <n.icon aria-hidden="true" className="h-4 w-4" />
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="hidden md:block p-3 border-t border-border/60 space-y-1">
            <Link
              to="/connect"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
            >
              <Plug aria-hidden="true" className="h-4 w-4" /> MCP Connect
            </Link>
            <Link
              to="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to site
            </Link>
          </div>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="h-14 border-b border-border/60 bg-card/40 backdrop-blur-sm flex items-center gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Active model
              </span>
              <Select value={activeModel} onValueChange={(v) => setActiveModel(v as ModelId)}>
                <SelectTrigger className="h-8 w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: m.accent }}
                          aria-hidden
                        />
                        {m.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge
                variant="outline"
                className="hidden border-border text-muted-foreground sm:inline-flex"
                title="This model selector drives the prototype simulation. No provider is connected yet."
              >
                Not connected
              </Badge>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {killSwitch && (
                <Badge
                  variant="outline"
                  className="border-[color:var(--block)]/50 text-[color:var(--block)] gap-1.5"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[color:var(--block)] shield-pulse"
                    aria-hidden
                  />
                  LOCKDOWN
                </Badge>
              )}
              <Button size="sm" variant="ghost" onClick={resetDemo} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset demo
              </Button>
            </div>
          </div>
          <main id="dashboard-main" className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
