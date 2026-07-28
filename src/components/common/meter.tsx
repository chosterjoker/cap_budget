import { cn } from "@/lib/utils";

export type MeterTone = "accent" | "success" | "warning" | "danger";

const FILL: Record<MeterTone, string> = {
  accent: "bg-chart-1",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * A single ratio against a limit. The unfilled track is the lightest step of
 * the fill's own ramp so the bar reads as one object, and the fill carries
 * severity. `marker` drops a tick at a reference position (0–1) — used for the
 * "where the semester should be by now" pace mark.
 */
export function Meter({
  value,
  max,
  tone = "accent",
  marker,
  markerLabel,
  size = "default",
  className,
}: {
  value: number;
  max: number;
  tone?: MeterTone;
  marker?: number | null;
  markerLabel?: string;
  size?: "default" | "lg";
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const height = size === "lg" ? "h-3" : "h-2";

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-chart-track",
          height
        )}
      >
        <div
          className={cn("h-full rounded-r-full transition-[width]", FILL[tone])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {marker != null && marker > 0.02 && marker < 0.98 && (
        // 2px tick with a surface ring on both sides so it stays legible
        // wherever it lands on the fill.
        <span
          aria-hidden
          title={markerLabel}
          className={cn(
            "absolute top-0 w-0.5 rounded-full bg-foreground/70 ring-2 ring-card",
            height
          )}
          style={{ left: `calc(${marker * 100}% - 1px)` }}
        />
      )}
    </div>
  );
}
