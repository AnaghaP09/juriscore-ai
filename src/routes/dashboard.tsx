import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Layers, ScrollText, BookOpen, Plug, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Governance Dashboard — JurisCore AI" },
      { name: "description", content: "Cross-domain visibility into how AI is behaving company-wide." },
    ],
  }),
  component: DashboardLayout,
});

const nav = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/use-cases", label: "Use Cases", icon: Layers },
  { to: "/dashboard/audit", label: "Audit Log", icon: ScrollText },
  { to: "/dashboard/rulebooks", label: "Rulebooks", icon: BookOpen },
];

function DashboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      <a href="#dashboard-main" className="skip-link">Skip to main content</a>
      <aside aria-label="Dashboard navigation" className="w-full md:w-60 border-b md:border-b-0 md:border-r border-border/60 bg-sidebar shrink-0 flex md:flex-col">
        <div className="h-16 flex items-center px-5 border-b border-border/60 md:w-full">
          <Link to="/" aria-label="JurisCore AI — home" className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="inline-block h-6 w-6 rounded-sm bg-primary" />
            <span>JurisCore <span className="text-primary">AI</span></span>
          </Link>
        </div>
        <nav aria-label="Dashboard sections" className="p-3 flex-1 flex md:block gap-1 md:space-y-1 overflow-x-auto">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to) && (n.to !== "/dashboard" || pathname === "/dashboard");
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
      <main id="dashboard-main" className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
