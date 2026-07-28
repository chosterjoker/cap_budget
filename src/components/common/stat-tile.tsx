import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "success" | "warning" | "danger";

const TONE: Record<StatTone, string> = {
  default: "",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
};

/**
 * The one stat presentation used across the app: a quiet label above a large
 * value, with an optional line of explanation underneath. Values use
 * proportional figures — they stand alone rather than aligning in a column.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: StatTone;
}) {
  return (
    <Card>
      {/* Card already owns the vertical padding (py-4) — CardContent must only
          add horizontal padding, or the tile ends up hollow. */}
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1.5 text-2xl font-semibold leading-none tracking-tight",
            TONE[tone]
          )}
        >
          {value}
        </p>
        {hint && (
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Grid wrapper so every stat row on every page has the same rhythm. */
export function StatRow({
  children,
  cols = 4,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4"
      )}
    >
      {children}
    </div>
  );
}
