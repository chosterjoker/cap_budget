import { TrendingUp, Check, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Meter } from "@/components/common/meter";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Compares spend against how far into the semester we are. Spending power is
 * the budget plus Venmo income, matching how `availableBudget` is derived.
 */
function pace(spent: number, spendingPower: number, elapsed: number | null) {
  if (elapsed === null || spendingPower <= 0) return null;
  const expected = spendingPower * elapsed;
  const drift = spent - expected;
  // Anything inside 5% of the semester's total spending power is noise.
  const tolerance = spendingPower * 0.05;
  if (drift > tolerance) {
    return {
      label: "Ahead of pace",
      detail: `${formatCurrency(drift)} more spent than a steady burn`,
      icon: TrendingUp,
      className: "bg-warning-muted text-warning-fg",
    };
  }
  if (drift < -tolerance) {
    return {
      label: "Under pace",
      detail: `${formatCurrency(-drift)} less spent than a steady burn`,
      icon: Minus,
      className: "bg-muted text-muted-foreground",
    };
  }
  return {
    label: "On pace",
    detail: "Spend is tracking the semester timeline",
    icon: Check,
    className: "bg-success-muted text-success-fg",
  };
}

export function BudgetHealth({
  totalBudget,
  venmoTotal,
  totalSpent,
  availableBudget,
  elapsed,
}: {
  totalBudget: number;
  venmoTotal: number;
  totalSpent: number;
  availableBudget: number;
  elapsed: number | null;
}) {
  const spendingPower = totalBudget + venmoTotal;
  const usedPercent = spendingPower > 0 ? (totalSpent / spendingPower) * 100 : 0;
  const overspent = availableBudget < 0;
  const status = pace(totalSpent, spendingPower, elapsed);
  const StatusIcon = status?.icon;

  return (
    <Card className="overflow-hidden">
      {/* px only — Card contributes py-4, so py-2 here lands on an even 24px
          all round rather than 40px top/bottom against 24px sides. */}
      <CardContent className="grid gap-8 px-6 py-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available to spend
            </p>
            {status && StatusIcon && (
              <span
                title={status.detail}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  status.className
                )}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {status.label}
              </span>
            )}
          </div>

          {/* Hero figure: proportional figures, same sans as everything else. */}
          <p
            className={cn(
              "mt-2 text-5xl font-semibold leading-none tracking-tight",
              overspent && "text-danger-fg"
            )}
          >
            {formatCurrency(availableBudget)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            of {formatCurrency(spendingPower)} spending power
            {venmoTotal > 0 && (
              <> · includes {formatCurrency(venmoTotal)} Venmo income</>
            )}
          </p>

          <div className="mt-6">
            <Meter
              size="lg"
              value={totalSpent}
              max={spendingPower}
              tone={overspent ? "danger" : usedPercent >= 85 ? "warning" : "accent"}
              marker={elapsed}
              markerLabel={
                elapsed !== null
                  ? `Semester ${formatPercent(elapsed * 100)} elapsed`
                  : undefined
              }
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {formatCurrency(totalSpent)}
                </span>{" "}
                spent ({formatPercent(usedPercent)})
              </span>
              {elapsed !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-0.5 rounded-full bg-foreground/70" />
                  {formatPercent(elapsed * 100)} of the semester elapsed
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-t pt-6 text-sm lg:w-56 lg:grid-cols-1 lg:gap-y-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <Figure label="Total budget" value={formatCurrency(totalBudget)} />
          <Figure label="Spent to date" value={formatCurrency(totalSpent)} />
          <Figure label="Venmo income" value={formatCurrency(venmoTotal)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
