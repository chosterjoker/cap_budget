import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { prisma } from "@/lib/prisma";
import { getBudgetGridData } from "@/lib/budget-data";
import { DepositTracker } from "@/components/deposits/deposit-tracker";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CalendarPlus } from "lucide-react";

export default async function DepositsPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="Deposits are tracked against an active semester."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }

  const [deposits, budget, clearedChecks, sem] = await Promise.all([
    prisma.deposit.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "desc" },
    }),
    getBudgetGridData(semester.id),
    prisma.check.aggregate({
      where: { semesterId: semester.id, cleared: true },
      _sum: { amount: true },
    }),
    prisma.semester.findUnique({
      where: { id: semester.id },
      select: { openingBankBalance: true },
    }),
  ]);

  const totalDeposited = deposits.reduce((s, d) => s + d.amount, 0);
  // Expected bank balance = opening + deposits − cleared checks.
  const actualBankBalance =
    (sem?.openingBankBalance ?? 0) +
    totalDeposited -
    (clearedChecks._sum.amount ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposits & balance"
        description="Partial bank deposits and the resulting account balance"
      />
      <DepositTracker
        semesterId={semester.id}
        deposits={deposits}
        totalBudget={budget.totalBudget}
        totalDeposited={totalDeposited}
        totalSpent={budget.totalSpent}
        actualBankBalance={actualBankBalance}
        isTreasurer={session?.user.role === "TREASURER"}
      />
    </div>
  );
}
