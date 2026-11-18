"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { Splits } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MultiSelect } from "@/components/filters";
import { Spinner } from "@/components/ui/spinner";

const MODE_COLOR: Record<string, string> = { Online: "var(--online)", Offline: "var(--offline)", TR: "var(--tr)" };

/**
 * Period & mode split as charts: clearance % per mode (lines) and qualified students per mode
 * (bars), by month or 7-day range, for all selected competencies or one of them.
 */
export function PeriodModeCharts({
  split,
  modes,
  options,
  index = "01",
}: {
  split: Splits["period"];
  modes: string[];
  options: { value: string; label: string; short: string }[];
  index?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  // Picked competencies live in the URL (pcomps); the server counts students once across them.
  function pick(next: string[]) {
    const q = new URLSearchParams(params.toString());
    if (options.every((o) => next.includes(o.value))) q.delete("pcomps");
    else q.set("pcomps", next.join(","));
    start(() => router.push(`/?${q}`, { scroll: false }));
  }
  const source = split.subset;
  const shown = modes.filter((m) => source.some((r) => r.mode === m && r.values.some((v) => v !== null)));

  const value = (mode: string, stage: string, i: number) => source.find((r) => r.mode === mode && r.stage === stage)?.values[i] ?? null;
  const data = split.columns.map((c, i) => {
    const point: Record<string, string | number | null> = { label: c.label };
    for (const m of shown) {
      const att = value(m, "Attempted", i);
      const q = value(m, "Qualified", i);
      point[`${m}_att`] = att;
      point[`${m}_q`] = att === null ? null : q;
      point[`${m}_pct`] = att ? Math.round((1000 * (q ?? 0)) / att) / 10 : null;
    }
    return point;
  });
  const pctConfig = Object.fromEntries(shown.map((m) => [`${m}_pct`, { label: m, color: MODE_COLOR[m] }])) satisfies ChartConfig;
  const qConfig = Object.fromEntries(shown.map((m) => [`${m}_q`, { label: m, color: MODE_COLOR[m] }])) satisfies ChartConfig;
  const dense = split.columns.length > 8;
  const unit = split.grain === "week" ? "week" : "month";

  const tooltip = (key: "pct" | "q") => (
    <ChartTooltipContent
      formatter={(_v, name, item) => {
        const p = item.payload as Record<string, number | null>;
        const m = String(name).replace(/_(pct|q)$/, "");
        const att = p[`${m}_att`];
        const q = p[`${m}_q`];
        return (
          <span className="flex w-full items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: MODE_COLOR[m] }} />
              {m}
            </span>
            <span className="font-mono tabular-nums">
              {key === "pct" ? `${p[`${m}_pct`]}% · ` : ""}
              {q} / {att}
            </span>
          </span>
        );
      }}
    />
  );

  return (
    <Card className="gap-4 rounded-lg">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="eyebrow">{index} — Trend by mode</div>
          <CardTitle className="font-serif text-2xl font-normal">Clearance by {unit} and mode</CardTitle>
          <CardDescription>
            Qualified ÷ attempted distinct students per {unit}, for each mode, across the competencies ticked here (a student who sat two of them
            counts once). Gaps mean no exam in that {unit}.
          </CardDescription>
        </div>
        <div className="flex w-full items-end gap-2 sm:w-56">
          <div className="min-w-0 flex-1">
            <MultiSelect
              label="Competencies"
              allLabel="All competencies"
              selected={split.subsetComps}
              options={options}
              onChange={pick}
              pending={pending}
            />
          </div>
          {pending && <Spinner className="mb-2 shrink-0 text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent className="grid gap-8 px-2 sm:px-4 xl:grid-cols-2">
        {!shown.length ? (
          <p className="px-2 text-sm text-muted-foreground">No data for this selection.</p>
        ) : (
          <>
            <section className="min-w-0">
              <h3 className="mb-2 px-2 text-sm font-medium">Clearance %</h3>
              <ChartContainer config={pctConfig} className="aspect-auto h-[280px] w-full">
                <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={dense ? 12 : 4} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                  <ChartTooltip content={tooltip("pct")} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {shown.map((m) => (
                    <Line
                      key={m}
                      dataKey={`${m}_pct`}
                      stroke={`var(--color-${m}_pct)`}
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            </section>
            <section className="min-w-0">
              <h3 className="mb-2 px-2 text-sm font-medium">Qualified students</h3>
              <ChartContainer config={qConfig} className="aspect-auto h-[280px] w-full">
                <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap={dense ? "18%" : "28%"}>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={dense ? 12 : 4} />
                  <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                  <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={tooltip("q")} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {shown.map((m) => (
                    <Bar key={m} dataKey={`${m}_q`} fill={`var(--color-${m}_q)`} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  ))}
                </BarChart>
              </ChartContainer>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
