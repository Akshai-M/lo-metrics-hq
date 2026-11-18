import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, BadgeCheck, CalendarDays, Database, Repeat, RefreshCw, Users } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { TABS, type Tab } from "@/lib/tabs";
import { ClearanceTrendChart, CompetencyClearanceChart, type Point } from "@/components/charts";
import { StageFunnel } from "@/components/funnel";
import { SegmentedNav } from "@/components/filters";
import { GlobalFilters } from "@/components/global-filters";
import { ModeBenchmark, OverallModeCard, YogCohortSplits } from "@/components/mode-split";
import { PeriodSplitTable } from "@/components/split-tables";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPETENCIES, FILTER_KEYS, getLatestMetrics, getMe, getOverview, getSplits, type Overview } from "@/lib/api";
import { cn } from "@/lib/utils";

type Grain = "month" | "week";
type SP = { [key: string]: string | string[] | undefined };
// filters: the global filter params from the URL (FILTER_KEYS), as a query string; "" = defaults.
type State = { tab: Tab; grain: Grain; filters: string; user: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DESCRIPTIONS: Record<Tab, string> = {
  overview: "Students attempting and clearing FT competency assessments. Every number follows the filter bar.",
  splits: "Attempted and qualified students by competency, mode and period.",
  yog: "Clearance by mode, overall and by year of graduation.",
  competency: "Clearance and reattempts by competency and by assessment mode.",
  health: "Where the numbers come from: the latest run, exam events read, and attempts that could not be evaluated.",
};

function toPoint(p: Overview["periods"][number]): Point {
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
  const q = [params.toString(), s.filters].filter(Boolean).join("&");
  return q ? `/?${q}` : "/";
}

function grainOptions(state: State) {
  return [
    { value: "month", label: "Monthly", href: href({ ...state, grain: "month" }) },
    { value: "week", label: "Weekly", href: href({ ...state, grain: "week" }) },
  ];
}

const STAGE_NAME = { offline: "Offline", tr: "TR", both: "Offline and TR" } as const;

/** Greyed card for a metric whose source data doesn't exist yet. */
function PendingKpi({ label, needs }: { label: string; needs: string }) {
  return (
    <div className="flex flex-col gap-3 bg-muted/40 p-5 text-muted-foreground">
      <span className="text-sm">{label}</span>
      <div className="font-serif text-3xl text-muted-foreground/50">—</div>
      <span className="w-fit rounded border border-dashed px-1.5 py-0.5 text-xs">{needs}</span>
    </div>
  );
}

const CHIP = {
  green: "bg-chip-green text-primary",
  blue: "bg-chip-blue text-online-text",
  amber: "bg-chip-amber text-offline-text",
};

function Kpi({ label, value, sub, icon: Icon, chip }: { label: string; value: string; sub: string; icon: typeof Users; chip: keyof typeof CHIP }) {
  return (
    <div className="flex flex-col gap-3 bg-card p-5">
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

function Shell({ state, runId, bar, children }: { state: State; runId?: string; bar?: React.ReactNode; children: React.ReactNode }) {
  const hrefs = Object.fromEntries(TABS.map((t) => [t.key, href({ ...state, tab: t.key })])) as Record<Tab, string>;
  return (
    <SidebarProvider>
      <AppSidebar active={state.tab} hrefs={hrefs} user={state.user} />
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
        <div className="flex w-full flex-1 flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8 2xl:px-12">
          {bar}
          {children}
        </div>
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
  const me = await getMe();
  if (!me) redirect("/login");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "overview";
  const grain: Grain = sp.grain === "week" ? "week" : "month";
  const fq = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v) fq.set(k, v);
  }
  const state: State = { tab, grain, filters: fq.toString(), user: me.username };

  const [latest, ov, splits] = await Promise.all([
    getLatestMetrics(),
    getOverview(grain, state.filters), // also gives the filter bar its options
    tab === "overview" ? Promise.resolve(null) : getSplits(grain, state.filters),
  ]);

  if (!latest || !ov) {
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

  const { run, eventStatus: statuses, issues } = latest;
  const f = ov.filters;
  const bar = <GlobalFilters query={href(state).slice(2)} filters={f} options={ov.options} compNames={COMPETENCIES} />;

  if (tab === "splits") {
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} />
        {splits && <PeriodSplitTable split={splits.period} action={<SegmentedNav label="Grain" value={grain} options={grainOptions(state)} />} />}
      </Shell>
    );
  }

  if (tab === "yog") {
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} />
        {splits && (
          <>
            <ModeBenchmark split={splits.overall} modes={splits.modes} index="01" />
            <OverallModeCard split={splits.overall} modes={splits.modes} index="02" trCount={splits.trCount} />
            <YogCohortSplits groups={splits.yog} modes={splits.modes} index="03" />
          </>
        )}
      </Shell>
    );
  }

  if (tab === "competency") {
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} />
        <Card className="rounded-lg">
          <CardHeader>
            <div className="eyebrow">01 — Skill breakdown</div>
            <CardTitle className="font-serif text-2xl font-normal">Outcomes by competency</CardTitle>
            <CardDescription>
              Share of attempted students who cleared, by competency, for the selected modes ({f.modes.join(" + ")}). Reattempt % = students with 2+
              attempts ÷ students attempted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-10 gap-y-5 md:grid-cols-2 2xl:grid-cols-3">
              {ov.byCompetency.map((c) => {
                const pct = c.clearancePct ?? 0;
                return (
                  <li key={c.competency}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{c.competency}</span> <span className="font-medium">{COMPETENCIES[c.competency]}</span>
                      </span>
                      <span className="font-serif text-xl tabular-nums">{fmtPct(c.clearancePct)}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-2" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {c.cleared.toLocaleString()} cleared / {c.attempted.toLocaleString()} attempted · Reattempt {fmtPct(c.reattemptPct)} (
                      {c.reattempted.toLocaleString()})
                      {c.unevaluableRows > 0 && ` · ${c.unevaluableRows} unevaluable ${f.unevaluable ? "included" : "excluded"}`}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        {splits && <OverallModeCard split={splits.overall} modes={splits.modes} index="02" trCount={splits.trCount} />}
      </Shell>
    );
  }

  if (tab === "health") {
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} />
        <Card className="gap-0 overflow-hidden rounded-lg py-0">
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Latest run"
              value={run.runId.slice(0, 8)}
              sub={`${new Date(run.runAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · ${run.runId}`}
              icon={Database}
              chip="green"
            />
            <Kpi label="Events read" value={`${run.eventsRead} / ${run.eventsInScope}`} sub="Exam events in scope whose results sheet was read" icon={Activity} chip="green" />
            <Kpi
              label="Unevaluable (current filters)"
              value={ov.unevaluable.rows.toLocaleString()}
              sub={`attempts from ${ov.unevaluable.students.toLocaleString()} students · ${f.unevaluable ? "included as not cleared" : "left out of every denominator"}`}
              icon={AlertTriangle}
              chip="amber"
            />
            <Kpi
              label="Unevaluable (whole run)"
              value={run.unevaluableAttemptRows.toLocaleString()}
              sub="All modes, no filters: blank gated score or no cutoff for the attempt date"
              icon={AlertTriangle}
              chip="amber"
            />
          </div>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <div className="eyebrow">01 — Data coverage</div>
            <CardTitle className="font-serif text-2xl font-normal">Sources</CardTitle>
            <CardDescription>Exam events from the competency tracker. Not affected by the filters.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {statuses.map((st) => (
                <Badge key={st.status} variant={st.status === "Read" ? "default" : "outline"} className="h-6 gap-1.5 px-2.5">
                  {st.status} <span className="font-mono">{st.count}</span>
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
      </Shell>
    );
  }

  // Overview
  const points = ov.periods.map(toPoint);
  const compName = f.comps.length === ov.options.competencies.length ? "All competencies" : f.comps.join(", ");
  const scopeName = `${compName} · ${f.modes.join(" + ")}`;
  const r = ov.reattempts;
  const num = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));
  const stage = STAGE_NAME[ov.settings.clearanceStage];
  const trendScope = `${compName} · ${stage} stage`;
  const range = points.length ? `${points[0].full} — ${points[points.length - 1].full} · ${trendScope}` : trendScope;
  const a = ov.assessment;

  return (
    <Shell state={state} runId={run.runId} bar={bar}>
      <Hero state={state} runAt={run.runAt} controls={<SegmentedNav label="Grain" value={grain} options={grainOptions(state)} />} />

      <Card className="gap-0 overflow-hidden rounded-lg py-0">
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Kpi
            label="Students attempted"
            value={ov.attemptedStudents.toLocaleString()}
            sub={`${scopeName} · unevaluable ${f.unevaluable ? "included" : "excluded"}`}
            icon={Users}
            chip="green"
          />
          <Kpi
            label="Assessment clearance %"
            value={fmtPct(a.clearancePct)}
            sub={
              a.attempted
                ? `Stage: ${stage} cleared · ${a.cleared.toLocaleString()} / ${a.attempted.toLocaleString()} students who attempted ${stage}`
                : `Stage: ${stage} cleared · ${stage} is not in the Mode filter`
            }
            icon={BadgeCheck}
            chip="green"
          />
          <Kpi
            label="Reattempt %"
            value={fmtPct(ov.reattemptPct)}
            sub={`${ov.reattemptedStudents.toLocaleString()} students with 2+ attempts in a competency ÷ students attempted`}
            icon={Repeat}
            chip="blue"
          />
          <Kpi
            label="Median re-attempts to clear"
            value={r.toClear.median === null ? "n/a" : String(r.toClear.median)}
            sub={`Mean ${num(r.toClear.mean)} (${r.toClear.pairs.toLocaleString()} cleared pairs) · attempts so far: median ${r.soFar.median ?? "n/a"}, mean ${num(r.soFar.mean)}`}
            icon={RefreshCw}
            chip="blue"
          />
          <Kpi
            label="Unevaluable"
            value={ov.unevaluable.rows.toLocaleString()}
            sub={`attempts from ${ov.unevaluable.students.toLocaleString()} students · ${f.unevaluable ? "included as not cleared" : "left out of every denominator"}`}
            icon={AlertTriangle}
            chip="amber"
          />
        </div>
        <div className="grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-3 xl:grid-cols-6">
          <PendingKpi label="Pool → Placed % (FT)" needs="Needs placement data" />
          <PendingKpi label="FT (active)" needs="Needs placement data" />
          <PendingKpi label="Intern" needs="Needs placement data" />
          <PendingKpi label="Intern (active)" needs="Needs placement data" />
          <PendingKpi label="Internship clearance %" needs="Needs IRP data" />
          <PendingKpi label="NPS" needs="Needs survey data" />
        </div>
      </Card>

      <StageFunnel funnel={ov.funnel} poolEntry={ov.settings.poolEntryStage} online={f.online} index="01" />

      <ClearanceTrendChart
        key={`${grain}-${state.filters}`}
        points={points}
        index="02"
        title={`${grain === "month" ? "Monthly" : "Weekly"} ${stage} clearance`}
        range={range}
        splitsHref={href({ ...state, tab: "splits" })}
      />

      <CompetencyClearanceChart
        index="03"
        stage={`${stage} cleared`}
        bars={ov.funnel.byCompetency.map((c) => ({
          competency: c.competency,
          name: COMPETENCIES[c.competency],
          attempted: c.assessment.attempted,
          cleared: c.assessment.cleared,
          pct: c.assessment.clearancePct,
        }))}
      />
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
