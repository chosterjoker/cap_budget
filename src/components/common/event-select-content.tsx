"use client";

import { SelectContent, SelectItem } from "@/components/ui/select";
import { formatDateShort, toDateInput, todayInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EventOption = { id: string; name: string; date: Date | string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The option list for every "pick an event" Select. Events are ordered by how
 * close they are to today rather than start-of-semester first, since the one
 * being paid for is almost always this week's; past events are dimmed. The
 * popup is also allowed to grow wider than its trigger so names aren't clipped.
 *
 * `children` render above the events — the "All events" / "— None —" rows.
 */
export function EventSelectContent({
  events,
  children,
}: {
  events: EventOption[];
  children?: React.ReactNode;
}) {
  // Event dates are UTC-midnight calendar days, so compare day to day against
  // the viewer's local "today" (see lib/format).
  const today = todayInput();
  const todayMs = Date.parse(today);
  const sorted = events
    .map((e) => {
      const day = toDateInput(e.date);
      return { ...e, past: day < today, distance: Math.abs(Date.parse(day) - todayMs) / DAY_MS };
    })
    // Nearest first; on a tie the upcoming event wins over the past one.
    .sort((a, b) => a.distance - b.distance || Number(a.past) - Number(b.past));

  return (
    <SelectContent
      align="start"
      alignItemWithTrigger={false}
      className="w-auto max-w-[min(32rem,var(--available-width))] min-w-(--anchor-width)"
    >
      {children}
      {sorted.map((e) => (
        <SelectItem
          key={e.id}
          value={e.id}
          className={cn("py-1.5", e.past && "text-muted-foreground")}
        >
          <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDateShort(e.date)}
          </span>
          <span>{e.name}</span>
        </SelectItem>
      ))}
    </SelectContent>
  );
}
