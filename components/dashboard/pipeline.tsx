"use client";

import { ArrowRight, BadgeCheck, Briefcase, Gavel, Minus, TrendingDown, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Growth, Overview } from "@/lib/api";
import { COMPETENCIES } from "@/lib/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym: string | null) => (ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "n/a");
const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const SHORT: Record<string, string> = { C1: "DSA", C2: "FE", C3: "SE", C4: "BE", C7: "Gen AI" };
const compName = (id: string) => COMPETENCIES[id as keyof typeof COMPETENCIES] ?? id;
const CHIP = {
  green: "bg-chip-green text-primary",
  blue: "bg-chip-blue text-online-text",
  amber: "bg-chip-amber text-offline-text",
};

/** Small stock-style tag: up (green), down (red) or flat, latest month vs the month before. */
export function GrowthTag({ g }: { g: Growth }) {
  if (g.changePct === null)
    return <span className="text-xs text-muted-foreground">No {monthName(g.previousMonth)} base to compare</span>;
  const up = g.changePct > 0;
  const down = g.changePct < 0;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
        up ? "bg-chip-green text-primary" : down ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="size-3" />
      {up ? "+" : ""}
      {g.changePct.toFixed(1)}%
    </span>
  );
}

function HeadlineCard({ label, g, note, icon: Icon, chip }: { label: string; g: Growth; note: string; icon: LucideIcon; chip: keyof typeof CHIP }) {
  return (
    <div className="flex flex-col gap-3 bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", CHIP[chip])}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="font-serif text-3xl tabular-nums sm:text-4xl">{g.value.toLocaleString()}</div>
      <div className="flex flex-wrap items-center gap-2">
        <GrowthTag g={g} />
        <span className="text-xs text-muted-foreground">
          {g.latest.toLocaleString()} in {monthName(g.latestMonth)} vs {g.previous.toLocaleString()} in {monthName(g.previousMonth)}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

export function PipelineHeadline({ ov, online }: { ov: Pick<Overview, "funnel" | "pipeline">; online: boolean }) {
  const p = ov.pipeline;
  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0">
      <CardHeader className="border-b py-5">
        <div className="eyebrow">Pipeline</div>
        <CardTitle className="font-serif text-2xl font-normal">Offline → TR → Assessed Pool → Placed</CardTitle>
        <CardDescription>
          Distinct students in the selection. The assessed pool is students who cleared TR. Growth compares the latest month in the data
          with the month before it.
        </CardDescription>
      </CardHeader>
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <HeadlineCard label="Offline cleared" g={p.offlineCleared} note="Students who cleared offline" icon={BadgeCheck} chip="green" />
        <HeadlineCard label="TR cleared" g={p.trCleared} note="Students who cleared the TR interview" icon={Gavel} chip="blue" />
        <HeadlineCard label="Assessed pool" g={p.pool} note="Cleared TR, so in the placement pool" icon={Users} chip="amber" />
        <HeadlineCard
          label="Placed"
          g={p.placed}
          note={`${fmtPct(p.placedFromPool)} of the assessed pool, placed on or after pool entry`}
          icon={Briefcase}
          chip="green"
        />
      </div>
      <FlowSteps ov={ov} online={online} />
    </Card>
  );
}

/** Conversion steps inside the Pipeline card. Online → Offline is added when Include online data is on. */
function FlowSteps({ ov, online }: { ov: Pick<Overview, "funnel" | "pipeline">; online: boolean }) {
  const p = ov.pipeline;
  const stage = (mode: string) => ov.funnel.stages.find((s) => s.mode === mode && s.step === "attempted");
  const off = stage("Offline")?.conversion;
  const tr = stage("TR")?.conversion;
  const all = [
    { label: "Online → Offline", pct: off?.pct ?? null, num: off?.num, den: off?.den, hint: "of students who cleared Online, attempted Offline", online: true },
    { label: "Offline → TR", pct: tr?.pct ?? null, num: tr?.num, den: tr?.den, hint: "of students who cleared Offline, attempted TR", online: false },
    { label: "TR → Assessed Pool", pct: p.poolFromTrSitting, num: p.pool.value, den: p.trSitting, hint: "of students who sat TR, cleared it", online: false },
    { label: "Assessed Pool → Placed", pct: p.placedFromPool, num: p.placed.value, den: p.pool.value, hint: "of the assessed pool, placed after entry", online: false },
  ];
  const steps = all.filter((s) => !s.online || online);
  return (
    <div className={cn("grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-2", steps.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
      {steps.map((s, i) => (
        <div key={s.label} className="relative flex flex-col gap-2 bg-card p-5">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {s.label}
            {i < steps.length - 1 && <ArrowRight className="hidden size-3.5 xl:inline" />}
          </span>
          <div className="font-serif text-3xl tabular-nums">{fmtPct(s.pct)}</div>
          <div className="text-xs text-muted-foreground">
            {s.num !== undefined && s.den !== undefined ? `${s.num.toLocaleString()} / ${s.den.toLocaleString()}` : "No data"} · {s.hint}
          </div>
        </div>
      ))}
    </div>
  );
}

const TIER_CHIP: Record<string, string> = {
  "Strong Hire": "bg-chip-green text-primary",
  "Medium Hire": "bg-chip-blue text-online-text",
  "Low Hire": "bg-chip-amber text-offline-text",
  Reject: "bg-destructive/10 text-destructive",
};
const SHORT_LABEL: Record<string, string> = { "Below L2": "< L2", "Below L1": "< L1" };
const COMP_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/**
 * Levels and verdict bands for the latest TR interview of each student. Columns with no students
 * are hidden. On phones the competency table scrolls sideways with the competency name kept in view.
 */
export function TiersCard({ t }: { t: Overview["tiers"] }) {
  const sections = [
    { title: "Level", order: t.levelOrder, pick: (c: { levels: number[] }) => c.levels, total: t.levels, under: true },
    { title: "Verdict band", order: t.verdictOrder, pick: (c: { verdicts: number[] }) => c.verdicts, total: t.verdicts, under: false },
  ];
  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0">
      <CardHeader className="border-b py-5">
        <div className="eyebrow">TR outcomes</div>
        <CardTitle className="font-serif text-2xl font-normal">Levels and verdict bands</CardTitle>
        <CardDescription>
          Distinct students, each counted at their latest TR interview. Below L1 and Below L2 are under consideration. The total is distinct
          students, so it is not the sum of the competency rows.
        </CardDescription>
      </CardHeader>
      {sections.map((sec) => {
        const cols = sec.order.map((label, i) => ({ label, i })).filter((c) => sec.total[c.i] > 0);
        const series = t.byCompetency.filter((r) => r.attempted > 0);
        const data = cols.map((c) => ({
          label: SHORT_LABEL[c.label] ?? c.label,
          ...Object.fromEntries(series.map((r) => [r.competency, sec.pick(r)[c.i]])),
        }));
        const cfg = Object.fromEntries(
          series.map((r, i) => [r.competency, { label: SHORT[r.competency] ?? r.competency, color: COMP_COLORS[i % COMP_COLORS.length] }])
        ) as ChartConfig;
        return (
          <CardContent key={sec.title} className="flex flex-col gap-4 border-b px-4 py-5 last:border-b-0 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">{sec.title}</span>
              {sec.under && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Below L1 and Below L2: under consideration</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {cols.map((c) => (
                <div key={c.label} className="flex flex-col gap-1 rounded-md border bg-card p-3">
                  <span className={cn("w-fit rounded px-1.5 py-0.5 text-xs", TIER_CHIP[c.label] ?? "bg-muted text-muted-foreground")}>
                    {SHORT_LABEL[c.label] ?? c.label}
                  </span>
                  <span className="font-serif text-2xl tabular-nums">{sec.total[c.i].toLocaleString()}</span>
                </div>
              ))}
            </div>
            <ChartContainer config={cfg} className="aspect-auto h-[240px] w-full">
              <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {series.map((r) => (
                  <Bar key={r.competency} dataKey={r.competency} fill={`var(--color-${r.competency})`} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ChartContainer>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-44 bg-card px-4 sm:px-5">Competency</TableHead>
                    {cols.map((c) => (
                      <TableHead key={c.label} className={cn(num, "px-3")}>
                        {SHORT_LABEL[c.label] ?? c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.byCompetency.map((row) => (
                    <TableRow key={row.competency}>
                      <TableCell className="sticky left-0 z-10 bg-card px-4 font-medium sm:px-5">
                        {SHORT[row.competency] ?? row.competency}
                        <span className="hidden text-muted-foreground lg:inline"> · {compName(row.competency)}</span>
                      </TableCell>
                      {cols.map((c) => (
                        <TableCell key={c.label} className={cn(num, "px-3")}>
                          {sec.pick(row)[c.i].toLocaleString()}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        );
      })}
    </Card>
  );
}

const chartConfig = {
  offline: { label: "Offline cleared", color: "var(--chart-1)" },
  tr: { label: "TR cleared", color: "var(--chart-2)" },
  pool: { label: "Assessed pool", color: "var(--chart-3)" },
  placed: { label: "Placed", color: "var(--chart-4)" },
} satisfies ChartConfig;

/** Pipeline counts per competency, one bar per stage. */
export function PipelineChart({ ov }: { ov: Pick<Overview, "pipeline"> }) {
  const data = ov.pipeline.byCompetency
    .filter((c) => c.offlineCleared + c.trCleared + c.pool + c.placed > 0)
    .map((c) => ({ name: SHORT[c.competency] ?? c.competency, offline: c.offlineCleared, tr: c.trCleared, pool: c.pool, placed: c.placed }));
  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0">
      <CardHeader className="border-b py-5">
        <div className="eyebrow">Graph</div>
        <CardTitle className="font-serif text-2xl font-normal">Students at each stage, by competency</CardTitle>
        <CardDescription>Each competency counts its own students, so bars of different competencies can overlap.</CardDescription>
      </CardHeader>
      <div className="px-2 py-4 sm:px-4">
        {data.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No data for this selection.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} interval={0} />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="offline" fill="var(--color-offline)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="tr" fill="var(--color-tr)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pool" fill="var(--color-pool)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="placed" fill="var(--color-placed)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </Card>
  );
}

const num = "text-right tabular-nums";

export function CompetencyPipeline({ ov }: { ov: Pick<Overview, "pipeline"> }) {
  const p = ov.pipeline;
  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0">
      <CardHeader className="border-b py-5">
        <div className="eyebrow">By competency</div>
        <CardTitle className="font-serif text-2xl font-normal">Each competency through the pipeline</CardTitle>
        <CardDescription>
          A student who clears two competencies appears in both rows. The overlap row takes those repeats out, so the rows add up to the
          total of distinct students. Placed % = placed ÷ assessed pool in that competency.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competency</TableHead>
              <TableHead className={num}>Offline cleared</TableHead>
              <TableHead className={num}>TR cleared</TableHead>
              <TableHead className={num}>Sitting TR interview</TableHead>
              <TableHead className={num}>Assessed pool</TableHead>
              <TableHead className={num}>Placed</TableHead>
              <TableHead className={num}>Placed %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.byCompetency.map((c) => (
              <TableRow key={c.competency}>
                <TableCell className="font-medium">{COMPETENCIES[c.competency as keyof typeof COMPETENCIES] ?? c.competency}</TableCell>
                <TableCell className={num}>{c.offlineCleared.toLocaleString()}</TableCell>
                <TableCell className={num}>{c.trCleared.toLocaleString()}</TableCell>
                <TableCell className={num}>{c.trSitting.toLocaleString()}</TableCell>
                <TableCell className={num}>{c.pool.toLocaleString()}</TableCell>
                <TableCell className={num}>{c.placed.toLocaleString()}</TableCell>
                <TableCell className={num}>{fmtPct(c.placedPct)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="text-muted-foreground">
              <TableCell>Repeats: students already counted in another competency</TableCell>
              <TableCell className={num}>−{p.overlap.offlineCleared.toLocaleString()}</TableCell>
              <TableCell className={num}>−{p.overlap.trCleared.toLocaleString()}</TableCell>
              <TableCell className={num}>−{p.overlap.trSitting.toLocaleString()}</TableCell>
              <TableCell className={num}>−{p.overlap.pool.toLocaleString()}</TableCell>
              <TableCell className={num}>−{p.overlap.placed.toLocaleString()}</TableCell>
              <TableCell />
            </TableRow>
            <TableRow className="font-semibold">
              <TableCell>Total (distinct students)</TableCell>
              <TableCell className={num}>{p.offlineCleared.value.toLocaleString()}</TableCell>
              <TableCell className={num}>{p.trCleared.value.toLocaleString()}</TableCell>
              <TableCell className={num}>{p.trSitting.toLocaleString()}</TableCell>
              <TableCell className={num}>{p.pool.value.toLocaleString()}</TableCell>
              <TableCell className={num}>{p.placed.value.toLocaleString()}</TableCell>
              <TableCell className={num}>{fmtPct(p.placedFromPool)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
