"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type PctBar = { label: string; pct: number | null; num: number; den: number };

const pctConfig = { pct: { label: "Placed %", color: "var(--chart-2)" } } satisfies ChartConfig;

/** One % bar per group (0-100), with num / den in the tooltip and a label above each bar. */
export function PctBars({ data, unit = "students", height = 240 }: { data: PctBar[]; unit?: string; height?: number }) {
  const shown = data.filter((d) => d.den > 0);
  if (!shown.length) return <p className="px-2 text-sm text-muted-foreground">No data for this selection.</p>;
  const top = Math.max(10, Math.ceil(Math.max(...shown.map((d) => d.pct ?? 0)) / 10) * 10 + 5);
  return (
    <ChartContainer config={pctConfig} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={shown} margin={{ top: 22, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} interval={0} tick={{ fontSize: 11 }} />
        <YAxis domain={[0, Math.min(100, top)]} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_v, _n, item) => {
                const p = item.payload as PctBar;
                return (
                  <span className="font-mono tabular-nums">
                    {p.pct === null ? "n/a" : `${p.pct.toFixed(1)}%`} · {p.num.toLocaleString()} / {p.den.toLocaleString()} {unit}
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="pct" fill="var(--color-pct)" radius={[4, 4, 0, 0]} maxBarSize={64}>
          <LabelList dataKey="pct" position="top" className="fill-muted-foreground font-mono text-xs" formatter={(v) => (v == null ? "" : `${Number(v).toFixed(1)}%`)} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

const countConfig = { count: { label: "Students", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Horizontal count bars (long labels). */
export function CountBars({ data, highlight }: { data: { label: string; count: number }[]; highlight?: string }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <p className="px-2 text-sm text-muted-foreground">No data for this selection.</p>;
  return (
    <ChartContainer config={countConfig} className="aspect-auto w-full" style={{ height: 40 + data.length * 40 }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 4, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid horizontal={false} strokeDasharray="3 4" stroke="var(--grid)" />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={150} interval={0} tick={{ fontSize: 11 }} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(v) => (
                <span className="font-mono tabular-nums">
                  {Number(v).toLocaleString()} students · {((100 * Number(v)) / total).toFixed(1)}%
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="count"
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { label: string } }) => (
            <rect
              x={props.x}
              y={props.y}
              width={Math.max(0, props.width ?? 0)}
              height={props.height}
              rx={4}
              fill={props.payload?.label === highlight ? "var(--chart-2)" : "var(--chart-5)"}
            />
          )}
        >
          <LabelList dataKey="count" position="right" className="fill-muted-foreground font-mono text-xs" formatter={(v) => Number(v).toLocaleString()} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Verdict bands, strongest to weakest: two greens, ochre, berry; "No verdict" neutral.
const VERDICT_COLORS: Record<string, string> = {
  "Strong Hire": "var(--chart-2)",
  "Medium Hire": "color-mix(in oklab, var(--chart-2) 55%, white)",
  "Low Hire": "var(--offline)",
  Reject: "var(--tr)",
  "No verdict": "var(--chart-5)",
};

export type VerdictRow = { label: string; total: number; verdicts: { label: string; count: number; pct: number | null }[] };

/** 100% stacked horizontal bars: verdict band mix per competency (share of interviews). */
export function VerdictBars({ rows }: { rows: VerdictRow[] }) {
  if (!rows.length) return <p className="px-2 text-sm text-muted-foreground">No TR interviews for this selection.</p>;
  const keys = rows[0].verdicts.map((v) => v.label).filter((k) => rows.some((r) => r.verdicts.find((v) => v.label === k)!.count > 0));
  const data = rows.map((r) => ({
    label: r.label,
    total: r.total,
    ...Object.fromEntries(r.verdicts.map((v) => [v.label, v.pct ?? 0])),
    ...Object.fromEntries(r.verdicts.map((v) => [`${v.label}#n`, v.count])),
  }));
  const config = Object.fromEntries(keys.map((k) => [k, { label: k, color: VERDICT_COLORS[k] }])) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 70 + rows.length * 44 }}>
      <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ top: 0, right: 8, left: 4, bottom: 0 }} barCategoryGap="28%">
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={90} interval={0} tick={{ fontSize: 11 }} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => {
                const p = item.payload as Record<string, number>;
                const label = String(name);
                return (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono tabular-nums">
                      {Number(value).toFixed(1)}% · {p[`${label}#n`]} / {p.total}
                    </span>
                  </span>
                );
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((k) => (
          <Bar key={k} dataKey={k} name={k} stackId="v" fill={VERDICT_COLORS[k]} stroke="var(--card)" strokeWidth={2} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
