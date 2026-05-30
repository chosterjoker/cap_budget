"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatPercent } from "@/lib/format";
import { createExpense } from "@/actions/expenses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PaymentMethod } from "@prisma/client";

type Category = { id: string; name: string; allocatedAmount: number };
type Week = { id: string; weekNumber: number; label: string | null; startDate: Date };

const RANGE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});
function weekRange(startDate: Date) {
  const end = new Date(startDate);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${RANGE_FMT.format(new Date(startDate))}–${RANGE_FMT.format(end)}`;
}

// Frozen left columns: each left offset = cumulative width of the columns before it.
const FROZEN = {
  cat: "sticky left-0 z-10 w-40 min-w-40",
  budget: "sticky left-40 z-10 w-28 min-w-28",
  spent: "sticky left-[272px] z-10 w-28 min-w-28",
  pct: "sticky left-[384px] z-10 w-24 min-w-24 border-r",
};

type Row = {
  category: Category;
  weekAmounts: number[];
  spent: number;
  remaining: number;
  percentRemaining: number;
};

export function BudgetGrid({
  semesterId,
  weeks,
  rows,
  weekTotals,
  totalBudget,
  totalSpent,
  totalRemaining,
  percentRemaining,
  isTreasurer,
  paymentMethods,
}: {
  semesterId: string;
  weeks: Week[];
  rows: Row[];
  weekTotals: number[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  percentRemaining: number;
  isTreasurer: boolean;
  paymentMethods: { value: PaymentMethod; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{
    categoryId: string;
    weekId?: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createExpense({
        semesterId,
        categoryId: fd.get("categoryId") as string,
        weekId: (fd.get("weekId") as string) || undefined,
        amount: parseFloat(fd.get("amount") as string),
        description: fd.get("description") as string,
        date: fd.get("date") as string,
        paymentMethod: fd.get("paymentMethod") as PaymentMethod,
      });
      toast.success("Expense added");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to add expense");
    }
  }

  function cellColor(percent: number) {
    if (percent < 0) return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    if (percent < 20) return "bg-red-50 text-red-700 dark:bg-red-950/50";
    if (percent < 40) return "bg-amber-50 text-amber-800 dark:bg-amber-950/50";
    return "";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Total: {formatCurrency(totalBudget)} · Spent: {formatCurrency(totalSpent)}{" "}
          · Remaining: {formatCurrency(totalRemaining)} (
          {formatPercent(percentRemaining)})
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button onClick={() => setSelected(null)} size="sm">
                  Add expense
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add expense</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    name="categoryId"
                    defaultValue={selected?.categoryId}
                    items={Object.fromEntries(
                      rows.map((r) => [r.category.id, r.category.name])
                    )}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {rows.map((r) => (
                        <SelectItem key={r.category.id} value={r.category.id}>
                          {r.category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Week</Label>
                  <Select
                    name="weekId"
                    defaultValue={selected?.weekId}
                    items={Object.fromEntries(
                      weeks.map((w) => [
                        w.id,
                        `W${w.weekNumber}${w.label ? ` — ${w.label}` : ""}`,
                      ])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {weeks.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          W{w.weekNumber}
                          {w.label ? ` — ${w.label}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input name="amount" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      name="date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input name="description" required />
                </div>
                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <Select
                    name="paymentMethod"
                    defaultValue="CHECK"
                    items={Object.fromEntries(
                      paymentMethods.map((p) => [p.value, p.label])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">
                  Save
                </Button>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className={cn(FROZEN.cat, "bg-muted px-3 py-2 text-left font-medium")}>
                Category
              </th>
              <th className={cn(FROZEN.budget, "bg-muted px-2 py-2 text-right")}>Budget</th>
              <th className={cn(FROZEN.spent, "bg-muted px-2 py-2 text-right")}>Spent</th>
              <th className={cn(FROZEN.pct, "bg-muted px-2 py-2 text-right")}>% Left</th>
              {weeks.map((w) => (
                <th key={w.id} className="min-w-[84px] px-2 py-2 text-right align-bottom">
                  <div>W{w.weekNumber}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    {weekRange(w.startDate)}
                  </div>
                  {w.label && (
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {w.label}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category.id} className="border-b hover:bg-muted/30">
                <td className={cn(FROZEN.cat, "bg-background px-3 py-2 font-medium")}>
                  {row.category.name}
                </td>
                <td className={cn(FROZEN.budget, "bg-background px-2 py-2 text-right font-mono")}>
                  {formatCurrency(row.category.allocatedAmount)}
                </td>
                <td className={cn(FROZEN.spent, "bg-background px-2 py-2 text-right font-mono")}>
                  {formatCurrency(row.spent)}
                </td>
                <td
                  className={cn(
                    FROZEN.pct,
                    "bg-background px-2 py-2 text-right font-mono",
                    cellColor(row.percentRemaining)
                  )}
                >
                  {formatPercent(row.percentRemaining)}
                </td>
                {row.weekAmounts.map((amt, wi) => (
                  <td
                    key={wi}
                    className={cn(
                      "cursor-pointer px-2 py-2 text-right font-mono hover:bg-primary/10",
                      amt > 0 && "font-semibold"
                    )}
                    onClick={() => {
                      setSelected({
                        categoryId: row.category.id,
                        weekId: weeks[wi].id,
                      });
                      setOpen(true);
                    }}
                  >
                    {amt > 0 ? formatCurrency(amt) : "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/50 font-semibold">
              <td className={cn(FROZEN.cat, "bg-muted px-3 py-2")}>Total</td>
              <td className={cn(FROZEN.budget, "bg-muted px-2 py-2 text-right font-mono")}>
                {formatCurrency(totalBudget)}
              </td>
              <td className={cn(FROZEN.spent, "bg-muted px-2 py-2 text-right font-mono")}>
                {formatCurrency(totalSpent)}
              </td>
              <td className={cn(FROZEN.pct, "bg-muted px-2 py-2 text-right font-mono")}>
                {formatPercent(percentRemaining)}
              </td>
              {weekTotals.map((t, i) => (
                <td key={i} className="px-2 py-2 text-right font-mono">
                  {t > 0 ? formatCurrency(t) : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
