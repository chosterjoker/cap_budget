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
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-2",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[1.75rem] font-medium leading-tight tracking-[-0.035em] md:text-[2rem]">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
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
    <span className="inline-flex h-7 items-center rounded-full bg-card px-3 text-xs font-medium text-muted-foreground shadow-surface ring-1 ring-foreground/[0.07]">
      {children}
    </span>
  );
}
