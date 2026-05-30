export type WeekSeed = {
  weekNumber: number;
  startDate: Date;
  label: string | null;
};

function previousSunday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow === 0) return d;
  d.setDate(d.getDate() - dow);
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
    ? Math.ceil((last.getTime() - first.getTime()) / (7 * 86400000)) + 1
    : 16;

  for (let i = 0; i < maxWeeks; i++) {
    const ws = new Date(first);
    ws.setDate(first.getDate() + i * 7);
    if (last && ws > last) break;
    weeks.push({
      weekNumber: i + 1,
      startDate: ws,
      label: options.labels?.[i] ?? null,
    });
  }
  return weeks;
}

export function findWeekForDate(
  date: Date,
  weeks: { id: string; startDate: Date }[]
): string | null {
  const target = previousSunday(date).getTime();
  const match = weeks.find((w) => previousSunday(w.startDate).getTime() === target);
  return match?.id ?? null;
}
