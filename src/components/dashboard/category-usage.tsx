import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Meter } from "@/components/common/meter";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const VISIBLE = 8;

export type CategoryRow = {
  id: string;
  name: string;
  allocated: number;
  spent: number;
};

/**
 * Budget usage per category. Each row is a meter against its own allocation
 * with the numbers written out beside it, so the values never depend on a
 * hover — the tooltip-free equivalent of the chart this replaces.
 */
export function CategoryUsage({ rows }: { rows: CategoryRow[] }) {
  // Busiest first: over-budget categories float to the top, unused ones sink.
  const sorted = [...rows].sort((a, b) => {
    const ratio = (r: CategoryRow) =>
      r.allocated > 0 ? r.spent / r.allocated : r.spent > 0 ? Infinity : -1;
    return ratio(b) - ratio(a) || b.spent - a.spent;
  });
  const shown = sorted.slice(0, VISIBLE);
  const hidden = sorted.length - shown.length;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Budget by category</CardTitle>
        <CardDescription>
          Spent against each allocation, most used first
        </CardDescription>
        <CardAction>
          <Link
            href="/budget"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Full grid
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No categories yet. Add them in Settings.
          </p>
        ) : (
          <ul className="space-y-4">
            {shown.map((row) => {
              const over = row.spent - row.allocated;
              const isOver = over > 0.005;
              const ratio = row.allocated > 0 ? row.spent / row.allocated : 0;
              return (
                <li key={row.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      <span
                        className={cn(
                          "font-medium text-foreground",
                          isOver && "text-danger-fg"
                        )}
                      >
                        {formatCurrency(row.spent)}
                      </span>
                      {" / "}
                      {formatCurrency(row.allocated)}
                    </span>
                  </div>
                  <Meter
                    value={row.spent}
                    max={row.allocated}
                    tone={isOver ? "danger" : ratio >= 0.85 ? "warning" : "accent"}
                  />
                  {isOver && (
                    <p className="mt-1 text-xs text-danger-fg">
                      Over by {formatCurrency(over)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 && (
          <Link
            href="/budget"
            className="mt-4 block text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {hidden} more {hidden === 1 ? "category" : "categories"} not shown —
            see the full grid
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
