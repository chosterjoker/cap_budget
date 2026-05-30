const PALETTE = [
  { bg: "bg-rose-100", text: "text-rose-900", dot: "bg-rose-500", dark: "dark:bg-rose-950 dark:text-rose-200" },
  { bg: "bg-amber-100", text: "text-amber-900", dot: "bg-amber-500", dark: "dark:bg-amber-950 dark:text-amber-200" },
  { bg: "bg-emerald-100", text: "text-emerald-900", dot: "bg-emerald-500", dark: "dark:bg-emerald-950 dark:text-emerald-200" },
  { bg: "bg-sky-100", text: "text-sky-900", dot: "bg-sky-500", dark: "dark:bg-sky-950 dark:text-sky-200" },
  { bg: "bg-violet-100", text: "text-violet-900", dot: "bg-violet-500", dark: "dark:bg-violet-950 dark:text-violet-200" },
  { bg: "bg-pink-100", text: "text-pink-900", dot: "bg-pink-500", dark: "dark:bg-pink-950 dark:text-pink-200" },
  { bg: "bg-teal-100", text: "text-teal-900", dot: "bg-teal-500", dark: "dark:bg-teal-950 dark:text-teal-200" },
  { bg: "bg-indigo-100", text: "text-indigo-900", dot: "bg-indigo-500", dark: "dark:bg-indigo-950 dark:text-indigo-200" },
  { bg: "bg-orange-100", text: "text-orange-900", dot: "bg-orange-500", dark: "dark:bg-orange-950 dark:text-orange-200" },
  { bg: "bg-lime-100", text: "text-lime-900", dot: "bg-lime-500", dark: "dark:bg-lime-950 dark:text-lime-200" },
  { bg: "bg-cyan-100", text: "text-cyan-900", dot: "bg-cyan-500", dark: "dark:bg-cyan-950 dark:text-cyan-200" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-900", dot: "bg-fuchsia-500", dark: "dark:bg-fuchsia-950 dark:text-fuchsia-200" },
];

function hash(s: string): number {
  let h = 5381;
  const norm = s.trim().toLowerCase();
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function eventTypeColor(type: string | null | undefined) {
  if (!type) return null;
  return PALETTE[hash(type) % PALETTE.length];
}
