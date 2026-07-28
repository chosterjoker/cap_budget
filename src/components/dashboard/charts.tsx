"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";

/**
 * Measures its own box with a ResizeObserver and renders the chart with
 * concrete numeric width/height. This avoids Recharts' ResponsiveContainer,
 * which paints once with width/height of -1 before its observer fires and logs
 * "The width(-1) and height(-1) of chart should be greater than 0".
 */
function ChartFrame({
  children,
}: {
  children: (size: { width: number; height: number }) => React.ReactElement;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full">
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

type WeekPoint = { week: string; label: string | null; spent: number };

function WeekTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: WeekPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
      <p className="font-medium">{point.label || point.week}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {formatCurrency(point.spent)} spent
      </p>
    </div>
  );
}

export function WeeklySpendingChart({ data }: { data: WeekPoint[] }) {
  const spentWeeks = data.filter((d) => d.spent > 0);
  const average = spentWeeks.length
    ? spentWeeks.reduce((s, d) => s + d.spent, 0) / spentWeeks.length
    : 0;
  const peak = data.reduce<WeekPoint | null>(
    (best, d) => (!best || d.spent > best.spent ? d : best),
    null
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Weekly spending</CardTitle>
        <CardDescription>
          {peak && peak.spent > 0 ? (
            <>
              Peak {peak.label || peak.week} at {formatCurrency(peak.spent)} ·
              averaging {formatCurrency(average)} per active week
            </>
          ) : (
            "No spending recorded yet"
          )}
        </CardDescription>
      </CardHeader>
      {/* Height covers the plot plus the x-axis band, so the labels are never
          cut off into a nested scrollbar. */}
      <CardContent className="h-64">
        <ChartFrame>
          {({ width, height }) => (
            <BarChart
              width={width}
              height={height}
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickFormatter={(v) => formatCurrencyShort(v as number)}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                content={<WeekTooltip />}
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              />
              {average > 0 && (
                <ReferenceLine
                  y={average}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                />
              )}
              <Bar
                dataKey="spent"
                name="Spent"
                fill="var(--chart-1)"
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}
