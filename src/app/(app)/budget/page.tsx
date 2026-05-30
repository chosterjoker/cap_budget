import Link from "next/link";
import { auth } from "@/lib/auth";
import { getActiveSemester } from "@/lib/semester";
import { getBudgetGridData } from "@/lib/budget-data";
import { BudgetGrid } from "@/components/budget/budget-grid";
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
  const session = await auth();
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <p className="text-muted-foreground">
        No active semester.{" "}
        <Link href="/settings" className="underline">
          Create one
        </Link>
      </p>
    );
  }

  const grid = await getBudgetGridData(semester.id);
  const isTreasurer = session?.user.role === "TREASURER";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Budget Grid</h2>
          <p className="text-muted-foreground">{semester.name}</p>
        </div>
        <a
          href={`/api/export/budget?semesterId=${semester.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Export CSV
        </a>
      </div>
      <BudgetGrid
        semesterId={semester.id}
        weeks={grid.weeks}
        rows={grid.rows}
        weekTotals={grid.weekTotals}
        totalBudget={grid.totalBudget}
        totalSpent={grid.totalSpent}
        totalRemaining={grid.totalRemaining}
        percentRemaining={grid.percentRemaining}
        isTreasurer={isTreasurer}
        paymentMethods={PAYMENT_METHODS}
      />
    </div>
  );
}
