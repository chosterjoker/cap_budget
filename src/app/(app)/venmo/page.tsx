import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { getVenmoSummary } from "@/lib/budget-data";
import { VenmoManager } from "@/components/venmo/venmo-manager";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CalendarPlus } from "lucide-react";

export default async function VenmoPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="Venmo collections are recorded against an active semester."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }

  const [entries, payments, weeks, summary] = await Promise.all([
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
    // Same filter as getVenmoSummary, so the table adds up to "Paid via Venmo".
    prisma.check.findMany({
      where: { semesterId: semester.id, paymentMethod: "VENMO", isCarryover: false },
      orderBy: { date: "desc" },
      select: {
        id: true,
        checkNumber: true,
        description: true,
        recipientName: true,
        amount: true,
        date: true,
        event: { select: { name: true } },
      },
    }),
    prisma.week.findMany({
      where: { semesterId: semester.id },
      orderBy: { weekNumber: "asc" },
    }),
    getVenmoSummary(semester.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Venmo income"
        description="Collections come in here; checks paid via Venmo come out of the balance"
      />
      <VenmoManager
        semesterId={semester.id}
        entries={entries}
        payments={payments}
        weeks={weeks}
        summary={summary}
        isTreasurer={session?.user.role === "TREASURER"}
      />
    </div>
  );
}
