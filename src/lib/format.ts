export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

// Calendar dates (check date, expense date, event date, …) are stored as UTC
// midnight. Format them in UTC so every viewer sees the calendar day that was
// entered — formatting in local time renders UTC-midnight as the *previous* day
// for anyone west of UTC (e.g. all US timezones).
export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

// `YYYY-MM-DD` value for an <input type="date">, taken from the date's UTC
// components so it round-trips with how calendar dates are stored (UTC midnight)
// and displayed (formatDate, above).
export function toDateInput(date: Date | string) {
  return new Date(date).toISOString().slice(0, 10);
}

// Today's calendar date in the *viewer's* local zone, for "new" form defaults.
// (UTC "today" would pre-fill tomorrow for evening users west of UTC.)
export function todayInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatCurrencyShort(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1000).toFixed(0)}k`;
  if (abs >= 1_000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}
