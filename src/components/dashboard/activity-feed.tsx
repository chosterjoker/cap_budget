import Link from "next/link";
import { ArrowRight, FileText, Landmark, Receipt } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ActivityType = "check" | "reimbursement" | "deposit";

const META: Record<
  ActivityType,
  { icon: typeof FileText; label: string; href: string; inflow: boolean }
> = {
  check: { icon: FileText, label: "Check", href: "/checks", inflow: false },
  reimbursement: {
    icon: Receipt,
    label: "Reimbursement",
    href: "/reimbursements",
    inflow: false,
  },
  deposit: { icon: Landmark, label: "Deposit", href: "/deposits", inflow: true },
};

export function ActivityFeed({
  items,
}: {
  items: { type: ActivityType; date: Date; title: string; amount: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>
          The latest checks, reimbursements, and deposits
        </CardDescription>
        <CardAction>
          <Link
            href="/checks"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            All checks
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet this semester.
          </p>
        ) : (
          <ul className="-mx-2 grid gap-0.5 lg:grid-cols-2 lg:gap-x-6">
            {items.map((item, i) => {
              const meta = META[item.type];
              const Icon = meta.icon;
              return (
                <li key={`${item.type}-${i}`}>
                  <Link
                    href={meta.href}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {meta.label} · {formatDate(item.date)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        meta.inflow && "text-success-fg"
                      )}
                    >
                      {meta.inflow ? "+" : "−"}
                      {formatCurrency(item.amount)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
