"use client";

import { cn } from "@/lib/utils";

// `createdAt` is a real instant (unlike the UTC-midnight calendar dates that
// formatDate handles), so it is shown in the viewer's own zone.
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const full = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/**
 * When a row was entered into the app, as opposed to the date of the
 * transaction itself. Rendered as a quiet second line under the row's date.
 */
export function LoggedAt({
  date,
  className,
}: {
  date: Date | string;
  className?: string;
}) {
  const d = new Date(date);
  return (
    // The server renders in its own zone and the browser in the viewer's, so
    // the text can legitimately differ on hydration.
    <span
      suppressHydrationWarning
      title={`Logged ${full.format(d)}`}
      className={cn("block text-xs text-muted-foreground", className)}
    >
      Logged {short.format(d)}
    </span>
  );
}
