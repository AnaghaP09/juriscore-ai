import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HEARINGS, isThisWeek, DEMO_TODAY } from "@/lib/juriscore/legal-mock";

export const Route = createFileRoute("/dashboard/hearings")({
  head: () => ({
    meta: [
      { title: "Hearings & Monitoring — JurisCore AI" },
      { name: "description", content: "Upcoming hearings, depositions, and filing deadlines." },
    ],
  }),
  component: HearingsPage,
});

function HearingsPage() {
  const thisWeek = HEARINGS.filter((h) => isThisWeek(h.when, DEMO_TODAY));
  const later = HEARINGS.filter((h) => !isThisWeek(h.when, DEMO_TODAY));

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        eyebrow="Work"
        icon={<CalendarClock className="h-5 w-5" aria-hidden />}
        title="Hearings & monitoring"
        description="Everything on the calendar and every deadline being tracked."
      />

      <HearingList title={`This week (${thisWeek.length})`} items={thisWeek} accent />
      <HearingList title={`Coming up (${later.length})`} items={later} />
    </div>
  );
}

function HearingList({
  title,
  items,
  accent,
}: {
  title: string;
  items: typeof HEARINGS;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {accent && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Nothing scheduled.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((h) => (
              <li key={h.id} className="p-4 sm:px-6 flex flex-wrap items-start gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{h.client}</div>
                  <div className="text-sm text-muted-foreground">{h.forum}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Matter {h.matterId} · Lead {h.owner}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="secondary">{h.type}</Badge>
                  <div className="text-xs text-muted-foreground tabular-nums mt-1">
                    {new Date(h.when).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
