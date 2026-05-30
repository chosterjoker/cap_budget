import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { getEventSpending } from "@/lib/budget-data";
import { CalendarManager } from "@/components/calendar/calendar-manager";

export default async function CalendarPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return <p className="text-muted-foreground">No active semester.</p>;
  }
  const events = await getEventSpending(semester.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Social Calendar</h2>
        <p className="text-muted-foreground">{semester.name}</p>
      </div>
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
