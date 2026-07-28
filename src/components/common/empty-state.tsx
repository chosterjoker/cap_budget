import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The shared "nothing here yet" block. Every page that can render without data
 * uses this, so a missing semester looks the same everywhere instead of a bare
 * sentence on one page and a full panel on another.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center justify-center gap-3 py-24 text-center",
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Link href={action.href} className={cn(buttonVariants(), "mt-2")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Smaller variant for an empty region inside a card or table. */
export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
  );
}
