import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { getEventSpending } from "@/lib/budget-data";
import { CalendarManager } from "@/components/calendar/calendar-manager";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CalendarPlus } from "lucide-react";

export default async function CalendarPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="Events belong to a semester's weeks, so create one first."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }
  const events = await getEventSpending(semester.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social calendar"
        description={`${semester.name} · events and what each one cost`}
      />
      <CalendarManager
        semesterId={semester.id}
        events={events.map((e) => ({
          id: e.event.id,
          name: e.event.name,
          date: e.event.date,
          time: e.event.time,
          eventType: e.event.eventType,
          audience: e.event.audience,
          isInformational: e.event.isInformational,
          weekNumber: e.event.week?.weekNumber ?? null,
          weekLabel: e.event.week?.label ?? null,
          total: e.total,
          byCategory: e.byCategory,
        }))}
        isTreasurer={session?.user.role === "TREASURER"}
      />
    </div>
  );
}
