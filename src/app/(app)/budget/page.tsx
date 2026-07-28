import { CalendarPlus, Download } from "lucide-react";
import { getActiveSemester } from "@/lib/semester";
import { getBudgetGridData } from "@/lib/budget-data";
import { BudgetGrid } from "@/components/budget/budget-grid";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = [
  { value: "CHECK" as const, label: "Check" },
  { value: "WIRE_TRANSFER" as const, label: "Wire transfer" },
  { value: "CREDIT_CARD" as const, label: "Credit card" },
  { value: "VENMO" as const, label: "Venmo" },
  { value: "CASH" as const, label: "Cash" },
  { value: "OTHER" as const, label: "Other" },
];

export default async function BudgetPage() {
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No active semester"
        description="The budget grid needs an active semester with categories and weeks."
        action={{ href: "/settings", label: "Go to Settings" }}
      />
    );
  }

  const grid = await getBudgetGridData(semester.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget grid"
        description={`${semester.name} · spending by category and week`}
        actions={
          <a
            href={`/api/export/budget?semesterId=${semester.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
      />
      <BudgetGrid
        semesterId={semester.id}
        weeks={grid.weeks}
        rows={grid.rows}
        weekTotals={grid.weekTotals}
        totalBudget={grid.totalBudget}
        totalSpent={grid.totalSpent}
        totalRemaining={grid.totalRemaining}
        percentRemaining={grid.percentRemaining}
        paymentMethods={PAYMENT_METHODS}
      />
    </div>
  );
}
