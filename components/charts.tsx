"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type Point = {
  label: string; // axis label
  full: string; // tooltip title
  attempted: number;
  cleared: number;
  pct: number | null;
};

const config = {
  attempted: { label: "Attempted", color: "var(--chart-1)" },
  cleared: { label: "Cleared", color: "var(--chart-2)" },
  pct: { label: "Clearance rate", color: "var(--chart-3)" },
} satisfies ChartConfig;

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `${v}`);

/**
 * Attempted and cleared students (bars, left axis) with the clearance rate (line, right axis 0-100%).
 * Tooltip shows all three values for a period.
 */
export function ClearanceTrendChart({
  points,
  index,
  title,
  range,
  onInspect,
}: {
  points: Point[];
  index: string;
  title: string;
  range: string;
  onInspect: () => void;
}) {
  const best = points.filter((p) => p.pct !== null && p.attempted >= 20).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const dense = points.length > 12;

  return (
    <Card className="gap-4 rounded-lg">
      <CardHeader>
        <div className="eyebrow">{index} — Volume &amp; rate</div>
        <CardTitle className="font-serif text-2xl font-normal">{title}</CardTitle>
        <CardDescription className="eyebrow">{range}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {points.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No data for this selection.</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[300px] w-full sm:h-[360px] xl:h-[400px]">
            <ComposedChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={dense ? 2 : 10} barCategoryGap={dense ? "18%" : "28%"}>
              <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={dense ? 12 : 4} />
              <YAxis yAxisId="count" tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v) => `${v}%`}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
                    formatter={(value, name, item) => (
                      <div className="flex w-full items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                        <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? name}</span>
                        <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                          {name === "pct" ? (value == null ? "n/a" : `${Number(value).toFixed(1)}%`) : Number(value).toLocaleString()}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend verticalAlign="top" align="right" content={<ChartLegendContent className="justify-end pb-4" />} />
              <Bar yAxisId="count" dataKey="attempted" fill="var(--color-attempted)" radius={[3, 3, 0, 0]} maxBarSize={44} />
              <Bar yAxisId="count" dataKey="cleared" fill="var(--color-cleared)" radius={[3, 3, 0, 0]} maxBarSize={44} />
              <Line
                yAxisId="pct"
                dataKey="pct"
                type="linear"
                stroke="var(--color-pct)"
                strokeWidth={2}
                dot={{ r: dense ? 3 : 4, fill: "var(--card)", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "var(--card)", strokeWidth: 2 }}
                connectNulls
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t bg-transparent py-3 text-sm">
        {best ? (
          <span className="text-muted-foreground">
            <ArrowUpRight className="mr-1.5 inline size-4 align-[-3px] text-primary" />
            {best.full} led with <span className="font-semibold text-foreground">{best.pct?.toFixed(0)}%</span> clearance across{" "}
            {best.attempted.toLocaleString()} attempted.
          </span>
        ) : (
          <span />
        )}
        <button type="button" onClick={onInspect} className="flex items-center gap-1 font-medium text-primary hover:underline">
          Inspect competency &amp; mode splits <ArrowRight className="size-4" />
        </button>
      </CardFooter>
    </Card>
  );
}

export type CompetencyBar = { competency: string; name: string; attempted: number; cleared: number; pct: number | null };

const barConfig = { pct: { label: "Assessment clearance", color: "var(--chart-2)" } } satisfies ChartConfig;

/** Assessment clearance % per competency (one series, 0-100%). */
export function CompetencyClearanceChart({ bars, index, stage }: { bars: CompetencyBar[]; index: string; stage: string }) {
  const data = bars.filter((b) => b.attempted > 0);
  return (
    <Card className="gap-4 rounded-lg">
      <CardHeader>
        <div className="eyebrow">{index} — By competency</div>
        <CardTitle className="font-serif text-2xl font-normal">Assessment clearance % by competency</CardTitle>
        <CardDescription>
          {stage} students ÷ students who attempted that stage, per competency. Competencies with no attempts at that stage are left out.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {data.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No data for this selection.</p>
        ) : (
          <ChartContainer config={barConfig} className="aspect-auto h-[280px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
              <XAxis dataKey="competency" tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as CompetencyBar | undefined;
                      return p ? `${p.competency} ${p.name}` : "";
                    }}
                    formatter={(_value, _name, item) => {
                      const p = item.payload as CompetencyBar;
                      return (
                        <span className="font-mono tabular-nums">
                          {p.pct === null ? "n/a" : `${p.pct.toFixed(1)}%`} · {p.cleared.toLocaleString()} / {p.attempted.toLocaleString()}
                        </span>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="pct" fill="var(--color-pct)" radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
