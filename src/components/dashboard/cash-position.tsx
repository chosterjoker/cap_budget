import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The cash ledger read top to bottom: what's in hand, what the bank should
 * hold, and what's actually spendable once outstanding checks clear. Laid out
 * as a running calculation rather than four disconnected tiles, because the
 * lines only make sense in relation to each other.
 */
export function CashPosition({
  undeposited,
  openingBankBalance,
  totalDeposited,
  clearedAmount,
  expectedBankBalance,
  unclearedAmount,
  unclearedChecks,
  trueAvailable,
  latestReconciliation,
  reconciliationDelta,
}: {
  undeposited: number;
  openingBankBalance: number;
  totalDeposited: number;
  clearedAmount: number;
  expectedBankBalance: number;
  unclearedAmount: number;
  unclearedChecks: number;
  trueAvailable: number;
  latestReconciliation: { date: Date; actualBalance: number } | null;
  reconciliationDelta: number | null;
}) {
  const drifted =
    reconciliationDelta !== null && Math.abs(reconciliationDelta) >= 0.005;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Cash position</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="text-sm">
          <Line label="Opening bank balance" value={openingBankBalance} />
          <Line label="Deposits recorded" value={totalDeposited} sign="+" />
          <Line label="Checks cleared" value={clearedAmount} sign="−" />
          <Line
            label="Expected bank balance"
            value={expectedBankBalance}
            emphasis
          />
          <Line
            label={
              unclearedChecks === 1
                ? "1 outstanding check"
                : `${unclearedChecks} outstanding checks`
            }
            value={unclearedAmount}
            sign="−"
            tone={unclearedAmount > 0 ? "warning" : undefined}
          />
          <Line label="True available cash" value={trueAvailable} total />
        </dl>

        <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              In hand, not yet deposited
            </span>
            <span
              className={cn(
                "font-medium tabular-nums",
                undeposited > 0 && "text-warning-fg"
              )}
            >
              {formatCurrency(undeposited)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {latestReconciliation
                ? `Bank confirmed ${formatDate(latestReconciliation.date)}`
                : "Never reconciled against the bank"}
            </span>
            {latestReconciliation && reconciliationDelta !== null ? (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  drifted ? "text-warning-fg" : "text-success-fg"
                )}
              >
                {drifted
                  ? `${reconciliationDelta > 0 ? "+" : "−"}${formatCurrency(
                      Math.abs(reconciliationDelta)
                    )} drift`
                  : "Matches"}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Line({
  label,
  value,
  sign,
  emphasis,
  total,
  tone,
}: {
  label: string;
  value: number;
  sign?: "+" | "−";
  emphasis?: boolean;
  total?: boolean;
  tone?: "warning";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-2",
        (emphasis || total) && "border-t",
        total && "mt-1 border-t-2 pt-3"
      )}
    >
      <dt
        className={cn(
          "text-muted-foreground",
          (emphasis || total) && "font-medium text-foreground",
          total && "text-base"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          (emphasis || total) && "font-semibold",
          total && "text-lg",
          tone === "warning" && value > 0 && "text-warning-fg",
          total && value < 0 && "text-danger-fg"
        )}
      >
        {sign && <span className="mr-0.5 text-muted-foreground">{sign}</span>}
        {formatCurrency(value)}
      </dd>
    </div>
  );
}
