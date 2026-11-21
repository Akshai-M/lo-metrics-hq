import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, BadgeCheck, Briefcase, CalendarDays, Database, Gavel, Repeat, RefreshCw, Timer, Users } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { TABS, type Tab } from "@/lib/tabs";
import { ClearanceTrendChart, CompetencyClearanceChart, type Point } from "@/components/charts";
import { StageFunnel } from "@/components/funnel";
import { GlobalFilters } from "@/components/global-filters";
import { ModeBenchmark, OverallModeCard, YogCohortSplits } from "@/components/mode-split";
import { PeriodModeCharts, PeriodTable } from "@/components/period-charts";
import { SPLIT_COMPETENCIES } from "@/lib/metrics/splits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { BucketChart, FailureChart } from "@/components/detail-charts";
import { StudentsTable } from "@/components/students-table";
import { CountBars, PctBars, VerdictBars } from "@/components/outcome-charts";
import { SegmentedNav, SelectNav } from "@/components/filters";
import {
  COMPETENCIES,
  FILTER_KEYS,
  getFailures,
  getLatestMetrics,
  getMe,
  getOutcomes,
  getOverview,
  getReattempts,
  getSplits,
  getStudents,
  type Overview,
} from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  competency: "Clearance and reattempts by competency and by assessment mode, and why attempts fail.",
  reattempts: "How many attempts students need to clear, and how long it takes.",
  outcomes: "From the assessed pool to placement, and how technical rounds turn out.",
  students: "One row per student for the current filters. Search, sort and download.",
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
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

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
      <SidebarInset className="min-w-0">
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
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8 2xl:px-12">
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

  const rcomp = typeof sp.rcomp === "string" && sp.rcomp in COMPETENCIES ? sp.rcomp : null;
  const none = Promise.resolve(null);
  const [latest, ov, splits, failures, reattempts, students, outcomes] = await Promise.all([
    getLatestMetrics(),
    getOverview(grain, state.filters), // also gives the filter bar its options
    ["splits", "yog", "competency"].includes(tab) ? getSplits(grain, tab === "splits" ? "online=1" : state.filters) : none,
    tab === "competency" ? getFailures(state.filters) : none,
    tab === "reattempts" ? getReattempts(rcomp, state.filters) : none,
    tab === "students" ? getStudents(state.filters) : none,
    tab === "outcomes" || tab === "overview" ? getOutcomes(state.filters) : none,
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
      <Shell state={state} runId={run.runId}>
        <Hero state={state} />
        {splits && (
          <>
            <PeriodModeCharts
              periods={splits.periods}
              modes={splits.modes}
              yogs={ov.options.yogs}
              names={Object.fromEntries(SPLIT_COMPETENCIES.map((c) => [c.short, `${c.short} · ${COMPETENCIES[c.id]}`]))}
              index="01"
            />
            <PeriodTable periods={splits.periods} index="02" />
          </>
        )}
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
        <Card className="gap-0 rounded-lg py-0">
          <CardHeader className="border-b py-5">
            <div className="eyebrow">03 — Failure reasons</div>
            <CardTitle className="font-serif text-2xl font-normal">Why attempts fail</CardTitle>
            <CardDescription>
              Not-cleared, evaluable attempts only, split into one row per gated section below its cutoff. Bars = share of the mode&apos;s not-cleared
              attempts that failed the section; an attempt that failed two sections counts under both, so bars add up to more than 100%. TR has no
              sections and is not shown.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-5">
            {!failures?.competencies.length ? (
              <p className="text-sm text-muted-foreground">No not-cleared assessment attempts for this selection.</p>
            ) : (
              <div className="grid gap-x-10 gap-y-8 xl:grid-cols-2">
                {failures.competencies.map((c) => (
                  <section key={c.competency} className="min-w-0">
                    <h3 className="text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{c.competency}</span> <span className="font-medium">{COMPETENCIES[c.competency]}</span>
                    </h3>
                    <p className="mb-2 text-xs text-muted-foreground tabular-nums">
                      Not-cleared attempts: {c.modes.map((m) => `${m.mode} ${m.failedAttempts.toLocaleString()}`).join(" · ")}
                    </p>
                    <FailureChart data={c} />
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (tab === "reattempts") {
    const fmtDay = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "n/a");
    const base = href(state);
    const compOptions = [
      { value: "all", label: "All selected", href: base },
      ...f.comps.map((c) => ({ value: c, label: `${c} ${COMPETENCIES[c]}`, href: `${base}${base.includes("?") ? "&" : "?"}rcomp=${c}` })),
    ];
    const ra = reattempts;
    const scope = ra?.competency ? `${ra.competency} ${COMPETENCIES[ra.competency]}` : `All selected competencies (${f.comps.join(", ")})`;
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} controls={<SelectNav label="Competency" value={ra?.competency ?? "all"} options={compOptions} />} />
        {ra && (
          <>
            <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Data currently covers {fmtDay(ra.range.from)} to {fmtDay(ra.range.to)} for this selection, so long durations are truncated: students who
              started late have had less time to reattempt or clear. Unit: student × competency, with TR interviews as their own sequence (same pairs and
              attempt numbers as the Reattempt % card). {scope} · {f.modes.join(" + ")}.
            </p>
            <Card className="gap-0 overflow-hidden rounded-lg py-0">
              <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
                <Kpi label="Student × competency pairs" value={ra.pairs.toLocaleString()} sub={`${ra.clearedPairs.toLocaleString()} cleared`} icon={Users} chip="green" />
                <Kpi
                  label="Median days between attempts"
                  value={ra.daysBetween.median === null ? "n/a" : String(ra.daysBetween.median)}
                  sub={`Median gap between consecutive attempts per pair, then the median across ${ra.daysBetween.pairs.toLocaleString()} pairs with 2+ attempts`}
                  icon={Timer}
                  chip="blue"
                />
                <Kpi
                  label="Cleared on first attempt"
                  value={fmtPct(ra.clearedPairs ? (100 * ra.attemptsToClear[0].count) / ra.clearedPairs : null)}
                  sub={`${ra.attemptsToClear[0].count.toLocaleString()} of ${ra.clearedPairs.toLocaleString()} cleared pairs`}
                  icon={BadgeCheck}
                  chip="green"
                />
              </div>
            </Card>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="gap-4 rounded-lg">
                <CardHeader>
                  <div className="eyebrow">01 — Attempts to clear</div>
                  <CardTitle className="font-serif text-2xl font-normal">Which attempt cleared it</CardTitle>
                  <CardDescription>Pairs by the attempt number of their first qualifying attempt, plus pairs not cleared yet.</CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-4">
                  <BucketChart
                    data={ra.attemptsToClear.map((b) => ({ ...b, bucket: b.bucket === "Not cleared yet" ? b.bucket : `Attempt ${b.bucket}` }))}
                    unit="pairs"
                    muted={["Not cleared yet"]}
                  />
                </CardContent>
              </Card>
              <Card className="gap-4 rounded-lg">
                <CardHeader>
                  <div className="eyebrow">02 — Time to clear</div>
                  <CardTitle className="font-serif text-2xl font-normal">Days from first attempt to clearance</CardTitle>
                  <CardDescription>Cleared pairs only: date of the first qualifying attempt minus the date of the first attempt in the selection.</CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-4">
                  <BucketChart data={ra.daysToClear} unit="pairs" />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </Shell>
    );
  }

  if (tab === "outcomes" && outcomes) {
    const pl = outcomes.placement;
    const tr = outcomes.tr;
    const stageName = STAGE_NAME[pl.stage];
    const sinceText = pl.mix.since ? new Date(`${pl.mix.since}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "n/a";
    const unit = tr.count === "interviews" ? "interviews" : "students";
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} />
        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {outcomes.placementImport.importedAt
            ? `Placement data: ${outcomes.placementImport.records.toLocaleString()} records, imported ${fmtWhen(outcomes.placementImport.importedAt)}${outcomes.placementImport.source ? ` from ${outcomes.placementImport.source}` : ""}. To update, run bun run placements "<path to the Academy All Placed export>".`
            : `No placement data yet. Run bun run placements "<path to the Academy All Placed export>".`}
        </p>
        <Card className="gap-0 overflow-hidden rounded-lg py-0">
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Assessed pool" value={pl.pool.toLocaleString()} sub={`Students who cleared ${stageName} (pool entry) in the selection`} icon={Users} chip="green" />
            <Kpi
              label="Pool → Placed %"
              value={fmtPct(pl.poolToPlacedPct)}
              sub={`${pl.placed.toLocaleString()} placed on or after pool entry · ${pl.placedAnyTime.toLocaleString()} have a placement at any time`}
              icon={Briefcase}
              chip="green"
            />
            <Kpi
              label="Not cleared → Placed %"
              value={fmtPct(pl.notCleared.pct)}
              sub={`${pl.notCleared.placed.toLocaleString()} of ${pl.notCleared.attempted.toLocaleString()} who took ${stageName} but didn't clear, placed after their first attempt`}
              icon={Users}
              chip="amber"
            />
            <Kpi
              label="Median days to placement"
              value={pl.tat.median === null ? "n/a" : String(pl.tat.median)}
              sub={`From pool entry (${stageName} clearance) to the first placement after it · mean ${pl.tat.mean ?? "n/a"}`}
              icon={Timer}
              chip="blue"
            />
            <Kpi
              label="TR → Cleared %"
              value={fmtPct(tr.total.clearedPct)}
              sub={`${tr.total.cleared.toLocaleString()} of ${tr.total.attempted.toLocaleString()} ${unit} with a completed TR cleared`}
              icon={Gavel}
              chip="blue"
            />
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="gap-4 rounded-lg">
            <CardHeader>
              <div className="eyebrow">01 — Assessed vs not cleared</div>
              <CardTitle className="font-serif text-2xl font-normal">Placed % by assessment result</CardTitle>
              <CardDescription>
                Students who cleared {stageName} (placed on or after clearing) vs students who took {stageName} and didn&apos;t clear (placed on or after
                their first attempt).
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
              <PctBars
                data={[
                  { label: `Cleared ${stageName} (pool)`, pct: pl.poolToPlacedPct, num: pl.placed, den: pl.pool },
                  { label: `Took ${stageName}, not cleared`, pct: pl.notCleared.pct, num: pl.notCleared.placed, den: pl.notCleared.attempted },
                ]}
              />
            </CardContent>
          </Card>
          <Card className="gap-4 rounded-lg">
            <CardHeader>
              <div className="eyebrow">02 — Who is getting placed</div>
              <CardTitle className="font-serif text-2xl font-normal">Placements since {sinceText}</CardTitle>
              <CardDescription>
                {pl.mix.placed.toLocaleString()} students placed since the first {stageName} exam, by what they did in assessments (all assessment data,
                not the filters). &quot;Not assessed&quot; = no assessment attempt on record.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
              <CountBars data={pl.mix.groups} highlight="Cleared, then placed" />
            </CardContent>
          </Card>
        </div>

        <Card className="gap-4 rounded-lg">
          <CardHeader>
            <div className="eyebrow">03 — By competency</div>
            <CardTitle className="font-serif text-2xl font-normal">Pool → Placed % by competency</CardTitle>
            <CardDescription>
              Pool = cleared that competency at {stageName}. Placed on or after that clearance. Placement type of the pool placements:{" "}
              {pl.byType.map((t) => `${t.label.replace(/_/g, " ").toLowerCase()} ${t.count}`).join(", ") || "none"} · channel:{" "}
              {pl.byChannel.map((t) => `${t.label.replace(/_/g, " ").toLowerCase()} ${t.count}`).join(", ") || "none"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            <PctBars data={pl.byCompetency.map((c) => ({ label: c.competency, pct: c.pct, num: c.placed, den: c.pool }))} />
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-lg py-0">
          <CardHeader className="border-b py-5">
            <div className="eyebrow">04 — Technical round</div>
            <CardTitle className="font-serif text-2xl font-normal">TR → Cleared % and verdict bands</CardTitle>
            <CardDescription>
              Completed TR interviews in the selection (needs TR in the Mode filter). Cleared % counts {unit}; verdict bands are the share of interviews in each
              band (Verdict Band column of the TR sheet).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 py-5">
            <VerdictBars
              rows={[
                ...tr.byCompetency.map((c) => ({ label: c.competency, total: c.interviews, verdicts: c.verdicts })),
                ...(tr.byCompetency.length > 1 ? [{ label: "All", total: tr.total.interviews, verdicts: tr.total.verdicts }] : []),
              ]}
            />
          </CardContent>
          {tr.byCompetency.length > 0 && (
            <div className="border-t">
              <Table className="tabular">
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Competency</TableHead>
                    <TableHead className="text-right">TR attempted</TableHead>
                    <TableHead className="text-right">Cleared</TableHead>
                    <TableHead className="text-right">TR → Cleared %</TableHead>
                    {tr.total.verdicts.map((v) => (
                      <TableHead key={v.label} className="text-right last:pr-5">
                        {v.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="font-mono">
                  {[...tr.byCompetency, { competency: "All", ...tr.total }].map((c) => (
                    <TableRow key={c.competency} className={c.competency === "All" ? "font-semibold" : undefined}>
                      <TableCell className="pl-5 font-sans font-medium">{c.competency}</TableCell>
                      <TableCell className="text-right">{c.attempted.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{c.cleared.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{fmtPct(c.clearedPct)}</TableCell>
                      {c.verdicts.map((v) => (
                        <TableCell key={v.label} className="text-right last:pr-5">
                          {v.count} <span className="text-xs text-muted-foreground">({fmtPct(v.pct, 0)})</span>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </Shell>
    );
  }

  if (tab === "students") {
    const list = students?.students ?? [];
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} />
        <Card className="gap-0 rounded-lg py-0">
          <CardHeader className="border-b py-5">
            <div className="eyebrow">01 — Student-wise</div>
            <CardTitle className="font-serif text-2xl font-normal">Students</CardTitle>
            <CardDescription>
              Candidate IDs only; the data has no names or emails. Attempts count assessment sittings and TR interviews in the selected modes (
              {f.modes.join(" + ")}). Cleared = cleared at the {STAGE_NAME[ov.settings.clearanceStage]} stage, the same rule as the headline. The download
              has the rows matching the search, in the current sort order.
            </CardDescription>
          </CardHeader>
          <StudentsTable students={list} clearedLabel={STAGE_NAME[ov.settings.clearanceStage].toLowerCase()} activeDays={ov.options.activeDays} />
        </Card>
      </Shell>
    );
  }

  if (tab === "health") {
    return (
      <Shell state={state} runId={run.runId} bar={bar}>
        <Hero state={state} runAt={run.runAt} />
        <Card className="gap-0 overflow-hidden rounded-lg py-0">
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
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
            <Kpi
              label="Placement data"
              value={latest.placements ? latest.placements.records.toLocaleString() : "None"}
              sub={
                latest.placements
                  ? `records · imported ${fmtWhen(latest.placements.importedAt)}${latest.placements.source ? ` from ${latest.placements.source}` : ""} · bun run placements`
                  : "Not imported yet: run bun run placements"
              }
              icon={Briefcase}
              chip="green"
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
          {outcomes ? (
            <Kpi
              label="Pool → Placed %"
              value={fmtPct(outcomes.placement.poolToPlacedPct)}
              sub={`${outcomes.placement.placed.toLocaleString()} of ${outcomes.placement.pool.toLocaleString()} assessed-pool students placed after pool entry`}
              icon={Briefcase}
              chip="green"
            />
          ) : (
            <PendingKpi label="Pool → Placed %" needs="Needs placement data" />
          )}
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
    <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-5" /> Loading metrics…
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
