"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyShort } from "@/lib/format";

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

export function CategorySpendingChart({
  data,
}: {
  data: { name: string; budget: number; spent: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ChartFrame>
          {({ width, height }) => (
            <BarChart
              width={width}
              height={height}
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                angle={-35}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={(v) => formatCurrencyShort(v as number)} width={56} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="budget" name="Budget" fill="var(--chart-2)" />
              <Bar dataKey="spent" name="Spent" fill="var(--chart-1)" />
            </BarChart>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

export function WeeklySpendingChart({
  data,
}: {
  data: { week: string; label: string | null; spent: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Spending</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ChartFrame>
          {({ width, height }) => (
            <LineChart width={width} height={height} data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="week" />
              <YAxis tickFormatter={(v) => formatCurrencyShort(v as number)} width={56} />
              <Tooltip
                formatter={(v) => `$${Number(v).toLocaleString()}`}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload as { label?: string | null };
                  return item?.label || _;
                }}
              />
              <Line
                type="monotone"
                dataKey="spent"
                name="Spent"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}
