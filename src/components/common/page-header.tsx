import { cn } from "@/lib/utils";

/**
 * The single header treatment every page uses: title, one line of context,
 * and an optional right-hand slot for a badge or an action.
 */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(badge || actions) && (
        <div className="flex items-center gap-2">
          {badge}
          {actions}
        </div>
      )}
    </header>
  );
}

/** The pill used for at-a-glance page context (e.g. "Week 6 of 14"). */
export function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}
