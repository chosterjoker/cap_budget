export type WeekSeed = {
  weekNumber: number;
  startDate: Date;
  label: string | null;
};

const DAY_MS = 86400000;

// Calendar dates in this app (week starts, check/expense/reimbursement dates)
// are stored as UTC midnight — see `formatDate` in src/lib/format.ts. Week
// math therefore has to run in UTC too: using local getters would shift a
// Saturday- or Sunday-dated item into the wrong week on any server not running
// in UTC (e.g. `next dev` on a laptop in a US timezone).
function previousSunday(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay();
  if (dow === 0) return d;
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export function generateWeeks(
  startDate: Date,
  endDate: Date | null,
  options: { labels?: (string | null)[] } = {}
): WeekSeed[] {
  const first = previousSunday(startDate);
  const last = endDate ? new Date(endDate) : null;
  const weeks: WeekSeed[] = [];
  const maxWeeks = last
    ? Math.ceil((last.getTime() - first.getTime()) / (7 * DAY_MS)) + 1
    : 16;

  for (let i = 0; i < maxWeeks; i++) {
    const ws = new Date(first.getTime() + i * 7 * DAY_MS);
    if (last && ws > last) break;
    weeks.push({
      weekNumber: i + 1,
      startDate: ws,
      label: options.labels?.[i] ?? null,
    });
  }
  return weeks;
}

/**
 * The week whose Sunday-aligned range contains `date`, or null when the date
 * falls outside every defined week (before the semester starts, after it ends,
 * or a mistyped year).
 */
export function findWeekForDate(
  date: Date,
  weeks: { id: string; startDate: Date }[]
): string | null {
  const target = previousSunday(date).getTime();
  const match = weeks.find((w) => previousSunday(w.startDate).getTime() === target);
  return match?.id ?? null;
}
