"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import type { Bucket, Failures } from "@/lib/api";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const countConfig = { count: { label: "Pairs", color: "var(--chart-2)" } } satisfies ChartConfig;

/**
 * Counts per bucket (one series). Buckets listed in `muted` (e.g. "Not cleared yet") are drawn
 * in a neutral colour because they are not part of the scale.
 */
export function BucketChart({ data, unit, muted = [] }: { data: Bucket[]; unit: string; muted?: string[] }) {
  const total = data.reduce((s, b) => s + b.count, 0);
  if (!total) return <p className="px-2 text-sm text-muted-foreground">No data for this selection.</p>;
  return (
    <ChartContainer config={countConfig} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ top: 22, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={10} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value) => (
                <span className="font-mono tabular-nums">
                  {Number(value).toLocaleString()} {unit} · {((100 * Number(value)) / total).toFixed(1)}%
                </span>
              )}
            />
          }
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64}>
          {data.map((b) => (
            <Cell key={b.bucket} fill={muted.includes(b.bucket) ? "var(--chart-5)" : "var(--color-count)"} />
          ))}
          <LabelList dataKey="count" position="top" className="fill-muted-foreground font-mono text-xs" formatter={(v) => Number(v).toLocaleString()} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

type FailureCompetency = Failures["competencies"][number];
const MODE_COLOR: Record<string, string> = { Online: "var(--online)", Offline: "var(--offline)" };

/**
 * Failed sections for one competency: horizontal bars, one series per mode, value = share of the
 * mode's not-cleared attempts that failed the section. Tooltip has the counts.
 */
export function FailureChart({ data }: { data: FailureCompetency }) {
  const modes = data.modes.map((m) => m.mode);
  const labels = [...new Set(data.modes.flatMap((m) => m.sections.map((s) => s.label)))];
  const rows = labels
    .map((label) => {
      const row: Record<string, string | number | null> = { label };
      for (const m of data.modes) {
        const s = m.sections.find((x) => x.label === label);
        row[m.mode] = s ? s.pct : null;
        row[`${m.mode}#n`] = s ? s.count : 0;
        row[`${m.mode}#of`] = m.failedAttempts;
      }
      return row;
    })
    .sort((a, b) => Math.max(...modes.map((m) => Number(b[m] ?? 0))) - Math.max(...modes.map((m) => Number(a[m] ?? 0))));
  const config = Object.fromEntries(modes.map((m) => [m, { label: m, color: MODE_COLOR[m] ?? "var(--chart-4)" }])) satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 56 + rows.length * (modes.length > 1 ? 40 : 30) }}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid horizontal={false} strokeDasharray="3 4" stroke="var(--grid)" />
        <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={116} interval={0} tick={{ fontSize: 11 }} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => {
                const p = item.payload as Record<string, number>;
                return (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-mono tabular-nums">
                      {Number(value).toFixed(1)}% · {p[`${name}#n`].toLocaleString()} / {p[`${name}#of`].toLocaleString()}
                    </span>
                  </span>
                );
              }}
            />
          }
        />
        {modes.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {modes.map((m) => (
          <Bar key={m} dataKey={m} fill={`var(--color-${m})`} radius={[0, 4, 4, 0]} maxBarSize={16}>
            <LabelList dataKey={m} position="right" className="fill-muted-foreground font-mono text-[11px]" formatter={(v) => (v == null ? "" : `${Number(v).toFixed(0)}%`)} />
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
