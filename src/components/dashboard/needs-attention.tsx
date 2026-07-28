import Link from "next/link";
import { ChevronRight, CircleCheck, type LucideIcon } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AttentionItem = {
  icon: LucideIcon;
  title: string;
  detail: string;
  amount?: string;
  href: string;
  tone: "warning" | "danger" | "info";
};

const TONE: Record<AttentionItem["tone"], string> = {
  warning: "bg-warning-muted text-warning-fg",
  danger: "bg-danger-muted text-danger-fg",
  info: "bg-muted text-muted-foreground",
};

/**
 * Only renders what actually needs a decision — an empty list is a real,
 * useful answer, so it gets its own state rather than an empty card.
 */
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        {items.length > 0 && (
          <CardAction>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {items.length}
            </span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <CircleCheck className="h-8 w-8 text-success" />
            <p className="text-sm font-medium">Everything is settled</p>
            <p className="text-xs text-muted-foreground">
              No pending reimbursements, outstanding checks, or undeposited cash.
            </p>
          </div>
        ) : (
          <ul className="-mx-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        TONE[item.tone]
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    {item.amount && (
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {item.amount}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
