import Link from "next/link";
import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { getDashboardStats } from "@/lib/budget-data";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  CategorySpendingChart,
  WeeklySpendingChart,
} from "@/components/dashboard/charts";
import { ReconciliationPanel } from "@/components/dashboard/reconciliation-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <h2 className="text-xl font-semibold">No active semester</h2>
        <p className="text-muted-foreground">
          Create a semester in Settings to get started.
        </p>
        <Link
          href="/settings"
          className={cn(buttonVariants())}
        >
          Go to Settings
        </Link>
      </div>
    );
  }

  const stats = await getDashboardStats(semester.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">{semester.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Budget"
          value={formatCurrency(stats.totalBudget)}
          subtitle={`${formatPercent(stats.percentRemaining)} remaining`}
        />
        <StatCard
          title="Total Spent"
          value={formatCurrency(stats.totalSpent)}
          variant="warning"
        />
        <StatCard
          title="Available to Spend"
          value={formatCurrency(stats.availableBudget)}
          subtitle={`${formatCurrency(stats.totalSpent)} spent · ${formatCurrency(stats.venmoTotal)} Venmo`}
        />
        <StatCard
          title="Pending Reimbursements"
          value={formatCurrency(stats.pendingReimbursements)}
          subtitle={`${stats.pendingCount} requests`}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Cash Position
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Undeposited"
            value={formatCurrency(stats.undeposited)}
            subtitle="In hand, not yet at bank"
          />
          <StatCard
            title="Bank Balance (expected)"
            value={formatCurrency(stats.expectedBankBalance)}
            subtitle={`${formatCurrency(stats.totalDeposited)} deposited`}
          />
          <StatCard
            title="Outstanding Checks"
            value={formatCurrency(stats.unclearedAmount)}
            subtitle={`${stats.unclearedChecks} uncleared`}
            variant="warning"
          />
          <StatCard
            title="True Available Cash"
            value={formatCurrency(stats.trueAvailable)}
            subtitle="After outstanding checks clear"
            variant="success"
          />
        </div>
      </div>

      <ReconciliationPanel
        semesterId={semester.id}
        expectedBankBalance={stats.expectedBankBalance}
        reconciliations={stats.reconciliations}
        isTreasurer={session?.user.role === "TREASURER"}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CategorySpendingChart data={stats.categoryChart} />
        <WeeklySpendingChart data={stats.weekChart} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {stats.recentActivity.length === 0 && (
              <li className="text-sm text-muted-foreground">No recent activity</li>
            )}
            {stats.recentActivity.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between border-b pb-2 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{item.type}</Badge>
                  <span className="font-mono text-sm">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
