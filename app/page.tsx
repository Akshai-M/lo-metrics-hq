import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle, BadgeCheck, CalendarDays, RefreshCw, Users } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { TABS, type Tab } from "@/lib/tabs";
import { ClearanceTrendChart, type Point } from "@/components/charts";
import { SegmentedNav, SelectNav } from "@/components/filters";
import { ModeBenchmark, OverallModeCard, YogCohortSplits } from "@/components/mode-split";
import { PeriodSplitTable } from "@/components/split-tables";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPETENCIES, getLatestMetrics, getPeriods, getSplits, type PeriodRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Grain = "month" | "week";
type SP = { [key: string]: string | string[] | undefined };
type State = { tab: Tab; grain: Grain; scope: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DESCRIPTIONS: Record<Tab, string> = {
  overview: "Students attempting and clearing FT competency assessments, online and offline.",
  splits: "Attempted and qualified students by competency, mode and period.",
  yog: "Online vs offline clearance, overall and by year of graduation.",
  competency: "Clearance by competency and by assessment mode.",
};

function toPoint(p: PeriodRow): Point {
  if (p.grain === "month") {
    const [y, m] = p.period.split("-");
    const name = MONTHS[Number(m) - 1];
    return { label: name, full: `${name} ${y}`, attempted: p.attempted, cleared: p.cleared, pct: p.clearancePct };
  }
  // Week = 7-day range inside a month (1-7, 8-14, 15-21, 22-28, 29-end), keyed by its first day.
  const [y, m, d] = p.periodStart.split("-").map(Number);
  const end = d === 29 ? new Date(Date.UTC(y, m, 0)).getUTCDate() : d + 6;
  const name = MONTHS[m - 1];
  return { label: `${name} ${d}`, full: `${name} ${d}-${end}, ${y}`, attempted: p.attempted, cleared: p.cleared, pct: p.clearancePct };
}

const fmtPct = (v: number | null, d = 1) => (v === null ? "n/a" : `${v.toFixed(d)}%`);

function href(s: State) {
  const params = new URLSearchParams();
  if (s.tab !== "overview") params.set("tab", s.tab);
  if (s.grain !== "month") params.set("grain", s.grain);
  if (s.scope !== "ALL") params.set("scope", s.scope);
  const q = params.toString();
  return q ? `/?${q}` : "/";
}

function grainOptions(state: State) {
  return [
    { value: "month", label: "Monthly", href: href({ ...state, grain: "month" }) },
    { value: "week", label: "Weekly", href: href({ ...state, grain: "week" }) },
  ];
}

const CHIP = {
  green: "bg-chip-green text-primary",
  blue: "bg-chip-blue text-online-text",
  amber: "bg-chip-amber text-offline-text",
};

function Kpi({ label, value, sub, icon: Icon, chip }: { label: string; value: string; sub: string; icon: typeof Users; chip: keyof typeof CHIP }) {
  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", CHIP[chip])}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="font-serif text-3xl tabular-nums sm:text-4xl">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function Shell({ state, runId, children }: { state: State; runId?: string; children: React.ReactNode }) {
  const hrefs = Object.fromEntries(TABS.map((t) => [t.key, href({ ...state, tab: t.key })])) as Record<Tab, string>;
  return (
    <SidebarProvider>
      <AppSidebar active={state.tab} hrefs={hrefs} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5!" />
          <span className="eyebrow hidden truncate sm:inline">FT competency assessments</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="eyebrow flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" /> Internal report
            </span>
            {runId && (
              <>
                <Separator orientation="vertical" className="hidden h-5! sm:block" />
                <span className="eyebrow hidden sm:inline">Run {runId.slice(0, 8)}</span>
              </>
            )}
          </div>
        </header>
        <div className="flex w-full flex-1 flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8 2xl:px-12">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Hero({ state, runAt, controls }: { state: State; runAt?: string; controls?: React.ReactNode }) {
  const idx = TABS.findIndex((t) => t.key === state.tab);
  const tab = TABS[idx];
  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="eyebrow flex items-center gap-3">
          <span className="h-px w-5 bg-primary" />
          {tab.eyebrow} <span className="text-primary">/ {String(idx + 1).padStart(2, "0")}</span>
        </div>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">{tab.label}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{DESCRIPTIONS[state.tab]}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        {runAt && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            Latest run · {new Date(runAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
        {controls}
      </div>
    </section>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  await connection(); // always read the latest run at request time
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "overview";
  const grain: Grain = sp.grain === "week" ? "week" : "month";
  const scopeParam = typeof sp.scope === "string" ? sp.scope : "ALL";
  const scope = scopeParam in COMPETENCIES ? scopeParam : "ALL";
  const state: State = { tab, grain, scope };

  const [latest, periods, splits] = await Promise.all([
    getLatestMetrics(),
    tab === "overview" ? getPeriods(grain, scope) : Promise.resolve([] as PeriodRow[]),
    tab === "overview" ? Promise.resolve(null) : getSplits(grain),
  ]);

  if (!latest) {
    return (
      <Shell state={state}>
        <Hero state={state} />
        <Card className="rounded-lg">
          <CardContent className="text-sm text-muted-foreground">
            No metrics run found. Run <code className="font-mono">bun run refresh</code> to load data.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { run, competencies: comps, eventStatus: statuses, issues } = latest;
  const compsWithData = comps.filter((c) => c.attempted > 0);

  if (tab === "splits") {
    return (
      <Shell state={state} runId={run.runId}>
        <Hero state={state} runAt={run.runAt} />
        {splits && <PeriodSplitTable split={splits.period} action={<SegmentedNav label="Grain" value={grain} options={grainOptions(state)} />} />}
      </Shell>
    );
  }

  if (tab === "yog") {
    return (
      <Shell state={state} runId={run.runId}>
        <Hero state={state} runAt={run.runAt} />
        {splits && (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
              <ModeBenchmark split={splits.overall} index="01" />
              <OverallModeCard split={splits.overall} index="02" />
            </div>
            <YogCohortSplits groups={splits.yog} index="03" />
          </>
        )}
      </Shell>
    );
  }

  if (tab === "competency") {
    return (
      <Shell state={state} runId={run.runId}>
        <Hero state={state} runAt={run.runAt} />
        <Card className="rounded-lg">
          <CardHeader>
            <div className="eyebrow">01 — Skill breakdown</div>
            <CardTitle className="font-serif text-2xl font-normal">Outcomes by competency</CardTitle>
            <CardDescription>Share of attempted students who cleared, by competency (online and offline combined).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-10 gap-y-5 md:grid-cols-2 2xl:grid-cols-3">
              {compsWithData.map((c) => {
                const pct = c.attempted ? (100 * c.cleared) / c.attempted : 0;
                return (
                  <li key={c.competency}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{c.competency}</span> <span className="font-medium">{COMPETENCIES[c.competency]}</span>
                      </span>
                      <span className="font-serif text-xl tabular-nums">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-2" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {c.cleared.toLocaleString()} cleared / {c.attempted.toLocaleString()} attempted
                      {c.unevaluable > 0 && ` · ${c.unevaluable} unevaluable`}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        {splits && <OverallModeCard split={splits.overall} index="02" />}
      </Shell>
    );
  }

  // Overview
  const points = periods.map(toPoint);
  const scopeName = scope === "ALL" ? "All competencies" : `${scope} ${COMPETENCIES[scope]}`;
  const range = points.length ? `${points[0].full} — ${points[points.length - 1].full} · ${scopeName}` : scopeName;
  const scopeOptions = [
    { value: "ALL", label: "All competencies", href: href({ ...state, scope: "ALL" }) },
    ...compsWithData.map((c) => ({ value: c.competency, label: `${c.competency} ${COMPETENCIES[c.competency]}`, href: href({ ...state, scope: c.competency }) })),
  ];

  return (
    <Shell state={state} runId={run.runId}>
      <Hero
        state={state}
        runAt={run.runAt}
        controls={
          <>
            <SelectNav label="Scope" value={scope} options={scopeOptions} />
            <SegmentedNav label="Grain" value={grain} options={grainOptions(state)} />
          </>
        }
      />

      <Card className="gap-0 rounded-lg py-0">
        <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x xl:grid-cols-4 xl:divide-y-0 [&>*:nth-child(2)]:sm:border-r-0 xl:[&>*:nth-child(2)]:border-r">
          <Kpi label="Students attempted" value={run.attemptedStudents.toLocaleString()} sub="Across all FT competencies" icon={Users} chip="green" />
          <Kpi label="Cleared the bar" value={fmtPct(run.clearancePct)} sub={`${run.clearedStudents.toLocaleString()} students cleared at least one competency`} icon={BadgeCheck} chip="green" />
          <Kpi
            label="Mean re-attempts"
            value={run.reattemptMean === null ? "n/a" : run.reattemptMean.toFixed(2)}
            sub={`Median ${run.reattemptMedian ?? "n/a"} re-attempts before clearing`}
            icon={RefreshCw}
            chip="blue"
          />
          <Kpi
            label="Events read"
            value={`${run.eventsRead} / ${run.eventsInScope}`}
            sub={`${run.unevaluableAttemptRows.toLocaleString()} attempts unevaluable (blank scores)`}
            icon={AlertTriangle}
            chip="amber"
          />
        </div>
      </Card>

      <ClearanceTrendChart
        key={`${grain}-${scope}`}
        points={points}
        index="01"
        title={grain === "month" ? "Monthly progress" : "Weekly progress"}
        range={range}
        splitsHref={href({ ...state, tab: "splits" })}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <Card className="gap-0 rounded-lg py-0">
          <CardHeader className="border-b py-5">
            <div className="eyebrow">02 — Table view</div>
            <CardTitle className="font-serif text-2xl font-normal">{grain === "month" ? "By month" : "By week"}</CardTitle>
            <CardDescription>{scopeName}. A student counts once per period.</CardDescription>
          </CardHeader>
          <div className="max-h-[420px] overflow-auto">
            <Table className="tabular">
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{grain === "month" ? "Month" : "Week"}</TableHead>
                  <TableHead className="text-right">Attempted</TableHead>
                  <TableHead className="text-right">Cleared</TableHead>
                  <TableHead className="pr-5 text-right">Clearance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono">
                {points.map((p) => (
                  <TableRow key={p.full}>
                    <TableCell className="pl-5 font-sans">{p.full}</TableCell>
                    <TableCell className="text-right">{p.attempted.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{p.cleared.toLocaleString()}</TableCell>
                    <TableCell className="pr-5 text-right font-medium">{fmtPct(p.pct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <div className="eyebrow">03 — Data coverage</div>
            <CardTitle className="font-serif text-2xl font-normal">Sources</CardTitle>
            <CardDescription>Exam events from the competency tracker.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <Badge key={s.status} variant={s.status === "Read" ? "default" : "outline"} className="h-6 gap-1.5 px-2.5">
                  {s.status} <span className="font-mono">{s.count}</span>
                </Badge>
              ))}
            </div>
            {issues.length > 0 && (
              <ul className="flex flex-col divide-y rounded-md border text-xs">
                {issues.map((e) => (
                  <li key={e.event_idx} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2">
                    <span className="font-mono text-muted-foreground">#{e.event_idx}</span>
                    <span className="font-medium">{e.domain}</span>
                    <span className="text-muted-foreground">
                      {e.mode} · {e.assessment_no ?? "no A#"}
                    </span>
                    <Badge variant="outline" className="ml-auto">{e.status}</Badge>
                    {e.error && <span className="w-full text-muted-foreground">{e.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Cleared = every gated section meets its QC cutoff on one attempt. Periods use the attempt date.
            </p>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

function Loading() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 border-r bg-sidebar md:block" />
      <div className="flex flex-1 flex-col gap-6 p-8">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}
