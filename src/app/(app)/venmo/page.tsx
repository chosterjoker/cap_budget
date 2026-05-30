import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { VenmoManager } from "@/components/venmo/venmo-manager";

export default async function VenmoPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return <p className="text-muted-foreground">No active semester.</p>;
  }

  const [entries, weeks, total] = await Promise.all([
    prisma.venmoIncome.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "desc" },
      select: {
        id: true,
        amount: true,
        date: true,
        description: true,
        eventName: true,
        weekId: true,
        week: { select: { weekNumber: true, label: true } },
      },
    }),
    prisma.week.findMany({
      where: { semesterId: semester.id },
      orderBy: { weekNumber: "asc" },
    }),
    prisma.venmoIncome.aggregate({
      where: { semesterId: semester.id },
      _sum: { amount: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Venmo Income</h2>
        <p className="text-muted-foreground">
          Event collections separate from check payments
        </p>
      </div>
      <VenmoManager
        semesterId={semester.id}
        entries={entries}
        weeks={weeks}
        total={total._sum.amount ?? 0}
        isTreasurer={session?.user.role === "TREASURER"}
      />
    </div>
  );
}
