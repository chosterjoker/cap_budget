import {
  AlertTriangle,
  CalendarPlus,
  FileText,
  Landmark,
  Receipt,
  Scale,
  Wallet,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { getDashboardStats } from "@/lib/budget-data";
import { formatCurrency, formatDate } from "@/lib/format";
import { BudgetHealth } from "@/components/dashboard/budget-health";
import { CashPosition } from "@/components/dashboard/cash-position";
import {
  NeedsAttention,
  type AttentionItem,
} from "@/components/dashboard/needs-attention";
import { CategoryUsage } from "@/components/dashboard/category-usage";
import { WeeklySpendingChart } from "@/components/dashboard/charts";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ReconciliationPanel } from "@/components/dashboard/reconciliation-panel";
import { PageHeader, HeaderPill } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";

const WEEK_MS = 7 * 86_400_000;

/**
 * How far into the semester we are, 0–1. Prefers the explicit end date and
 * falls back to the end of the last generated week, so a semester saved
 * without an end date still gets a pace reading.
 */
function semesterProgress(
  startDate: Date,
  endDate: Date | null,
  weeks: { startDate: Date }[]
) {
  const start = startDate.getTime();
  const lastWeek = weeks.at(-1);
  const end = endDate
    ? endDate.getTime()
    : lastWeek
      ? lastWeek.startDate.getTime() + WEEK_MS
      : null;
  if (end === null || end <= start) return null;
  return Math.min(Math.max((Date.now() - start) / (end - start), 0), 1);
}

/** 1-based index of the week containing today, or null outside the semester. */
function currentWeekNumber(weeks: { weekNumber: number; startDate: Date }[]) {
  const now = Date.now();
  const week = weeks.find(
    (w) =>
      now >= w.startDate.getTime() && now < w.startDate.getTime() + WEEK_MS
  );
  return week?.weekNumber ?? null;
}

export default async function DashboardPage() {
  const session = await auth();
  const semester = await getActiveSemester();

  if (!semester) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="Create a semester with its budget, categories, and weeks to start tracking spending."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }

  const stats = await getDashboardStats(semester.id);
  const elapsed = semesterProgress(
    semester.startDate,
    semester.endDate,
    semester.weeks
  );
  const weekNumber = currentWeekNumber(semester.weeks);
  const overBudget = stats.rows.filter(
    (r) => r.spent - r.category.allocatedAmount > 0.005
  );
  const drifted =
    stats.reconciliationDelta !== null &&
    Math.abs(stats.reconciliationDelta) >= 0.005;

  const attention: AttentionItem[] = [];
  if (overBudget.length > 0) {
    attention.push({
      icon: AlertTriangle,
      title: `${overBudget.length} ${overBudget.length === 1 ? "category is" : "categories are"} over budget`,
      detail: overBudget.map((r) => r.category.name).join(", "),
      amount: formatCurrency(
        overBudget.reduce(
          (s, r) => s + (r.spent - r.category.allocatedAmount),
          0
        )
      ),
      href: "/budget",
      tone: "danger",
    });
  }
  if (drifted && stats.reconciliationDelta !== null) {
    attention.push({
      icon: Scale,
      title: "Bank balance doesn't match",
      detail: "Computed balance differs from the last reconciliation",
      amount: `${stats.reconciliationDelta > 0 ? "+" : "−"}${formatCurrency(
        Math.abs(stats.reconciliationDelta)
      )}`,
      href: "/#reconciliation",
      tone: "danger",
    });
  }
  if (stats.pendingCount > 0) {
    attention.push({
      icon: Receipt,
      title: `${stats.pendingCount} pending ${stats.pendingCount === 1 ? "reimbursement" : "reimbursements"}`,
      detail: "Awaiting approval or payment",
      amount: formatCurrency(stats.pendingReimbursements),
      href: "/reimbursements",
      tone: "warning",
    });
  }
  if (stats.unclearedChecks > 0) {
    attention.push({
      icon: FileText,
      title: `${stats.unclearedChecks} outstanding ${stats.unclearedChecks === 1 ? "check" : "checks"}`,
      detail: "Written but not yet cleared the bank",
      amount: formatCurrency(stats.unclearedAmount),
      href: "/checks",
      tone: "warning",
    });
  }
  if (stats.undeposited > 0.005) {
    attention.push({
      icon: Wallet,
      title: "Undeposited cash in hand",
      detail: "Collected but not yet taken to the bank",
      amount: formatCurrency(stats.undeposited),
      href: "/deposits",
      tone: "warning",
    });
  }
  if (stats.reconciliations.length === 0) {
    attention.push({
      icon: Landmark,
      title: "Never reconciled",
      detail: "Record what the bank shows to catch any drift",
      href: "/#reconciliation",
      tone: "info",
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {semester.name}
            {semester.endDate && (
              <>
                {" · "}
                {formatDate(semester.startDate)} – {formatDate(semester.endDate)}
              </>
            )}
          </>
        }
        badge={
          weekNumber !== null && (
            <HeaderPill>
              Week {weekNumber} of {semester.weeks.length}
            </HeaderPill>
          )
        }
      />

      <BudgetHealth
        totalBudget={stats.totalBudget}
        venmoTotal={stats.venmoTotal}
        totalSpent={stats.totalSpent}
        availableBudget={stats.availableBudget}
        elapsed={elapsed}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CashPosition
          undeposited={stats.undeposited}
          openingBankBalance={stats.openingBankBalance}
          totalDeposited={stats.totalDeposited}
          clearedAmount={stats.clearedAmount}
          expectedBankBalance={stats.expectedBankBalance}
          unclearedAmount={stats.unclearedAmount}
          unclearedChecks={stats.unclearedChecks}
          trueAvailable={stats.trueAvailable}
          latestReconciliation={stats.latestReconciliation}
          reconciliationDelta={stats.reconciliationDelta}
        />
        <NeedsAttention items={attention} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryUsage
          rows={stats.rows.map((r) => ({
            id: r.category.id,
            name: r.category.name,
            allocated: r.category.allocatedAmount,
            spent: r.spent,
          }))}
        />
        <WeeklySpendingChart data={stats.weekChart} />
      </div>

      <ActivityFeed items={stats.recentActivity} />

      <div id="reconciliation" className="scroll-mt-6">
        <ReconciliationPanel
          semesterId={semester.id}
          expectedBankBalance={stats.expectedBankBalance}
          reconciliations={stats.reconciliations}
          isTreasurer={session?.user.role === "TREASURER"}
        />
      </div>
    </div>
  );
}
