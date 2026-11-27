"use client";

import { useState } from "react";
import { Activity, AlertTriangle, BadgeCheck, Briefcase, Database, ExternalLink, Gavel, Timer, Users } from "lucide-react";
import type { Dashboard } from "@/lib/api";
import { COMPETENCIES } from "@/lib/shared";
import type { Tab } from "@/lib/tabs";
import { ModeBenchmark, OverallModeCard, YogCohortSplits } from "@/components/mode-split";
import { PeriodModeCharts } from "@/components/period-charts";
import { BucketChart, FailureChart } from "@/components/detail-charts";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { StudentsTable } from "@/components/students-table";
import { CountBars, PctBars, VerdictBars } from "@/components/outcome-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hero, Kpi } from "./ui";
import { CompetencyPipeline, PipelineChart, PipelineHeadline, TiersCard } from "./pipeline";

const STAGE_NAME = { offline: "Offline", tr: "TR", both: "Offline and TR" } as const;
const SPLIT_SHORT: Record<string, string> = { C1: "DSA", C2: "FE", C4: "BE", C3: "SE", C7: "Gen AI" };

const fmtPct = (v: number | null, d = 1) => (v === null ? "n/a" : `${v.toFixed(d)}%`);
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const fmtDay = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "n/a";

export function OverviewView({ d, onTab }: { d: Dashboard; onTab: (t: Tab) => void }) {
  const ov = d.overview;
  const f = ov.filters;

  return (
    <>
      <Hero
        tab="overview"
        runAt={d.latest.run.runAt}
        controls={<RefreshButton />}
      />
      <PipelineHeadline ov={ov} online={f.online} />
      <PipelineChart ov={ov} />
      <CompetencyPipeline ov={ov} />
      <TiersCard t={ov.tiers} />
    </>
  );
}

export function SplitsView({ d }: { d: Dashboard }) {
  const s = d.splits;
  return (
    <>
      <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Clearance by period and mode</h1>
      {s && (
        <PeriodModeCharts
          periods={s.periods}
          overall={s.overall}
          modes={s.modes}
          yogs={d.overview.options.yogs}
          names={Object.fromEntries(Object.entries(SPLIT_SHORT).map(([id, short]) => [short, `${short} · ${COMPETENCIES[id]}`]))}
        />
      )}
    </>
  );
}

export function YogView({ d }: { d: Dashboard }) {
  const s = d.splits;
  return (
    <>
      <Hero tab="yog" runAt={d.latest.run.runAt} />
      {s && (
        <>
          <ModeBenchmark split={s.overall} modes={s.modes} index="01" />
          <OverallModeCard split={s.overall} modes={s.modes} index="02" trCount={s.trCount} />
          <YogCohortSplits groups={s.yog} modes={s.modes} index="03" />
        </>
      )}
    </>
  );
}

export function CompetencyView({ d }: { d: Dashboard }) {
  const ov = d.overview;
  const f = ov.filters;
  const failures = d.failures;
  return (
    <>
      <Hero tab="competency" runAt={d.latest.run.runAt} />
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
      {d.splits && <OverallModeCard split={d.splits.overall} modes={d.splits.modes} index="02" trCount={d.splits.trCount} />}
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
    </>
  );
}

export function ReattemptsView({ d }: { d: Dashboard }) {
  const f = d.overview.filters;
  const [comp, setComp] = useState("all");
  // Every competency's views come in the same response, so switching needs no request.
  const ra = d.reattempts ? (comp !== "all" && d.reattempts.byComp[comp]) || d.reattempts.all : null;
  const current = ra?.competency ?? "all";
  const options = [{ value: "all", label: "All selected" }, ...f.comps.map((c) => ({ value: c, label: `${c} ${COMPETENCIES[c]}` }))];
  const scope = ra?.competency ? `${ra.competency} ${COMPETENCIES[ra.competency]}` : `All selected competencies (${f.comps.join(", ")})`;
  const picker = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <span className="eyebrow shrink-0">Competency</span>
      <Select value={current} items={options} onValueChange={(v) => setComp(String(v))}>
        <SelectTrigger className="w-full min-w-44 bg-card sm:w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width) max-w-[calc(100vw-2rem)]">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <>
      <Hero tab="reattempts" runAt={d.latest.run.runAt} controls={picker} />
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
    </>
  );
}

export function OutcomesView({ d }: { d: Dashboard }) {
  const outcomes = d.outcomes;
  if (!outcomes) return <Hero tab="outcomes" runAt={d.latest.run.runAt} />;
  const pl = outcomes.placement;
  const tr = outcomes.tr;
  const stageName = STAGE_NAME[pl.stage];
  const sinceText = fmtDay(pl.mix.since);
  const unit = tr.count === "interviews" ? "interviews" : "students";
  return (
    <>
      <Hero tab="outcomes" runAt={d.latest.run.runAt} />
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
    </>
  );
}

export function StudentsView({ d }: { d: Dashboard }) {
  const ov = d.overview;
  const stage = STAGE_NAME[ov.settings.clearanceStage];
  return (
    <>
      <Hero tab="students" runAt={d.latest.run.runAt} />
      <Card className="gap-0 rounded-lg py-0">
        <CardHeader className="border-b py-5">
          <div className="eyebrow">01 — Student-wise</div>
          <CardTitle className="font-serif text-2xl font-normal">Students</CardTitle>
          <CardDescription>
            Candidate IDs only; the data has no names or emails. Attempts count assessment sittings and TR interviews in the selected modes (
            {ov.filters.modes.join(" + ")}). Cleared = cleared at the {stage} stage, the same rule as the headline. The download has the rows matching the
            search, in the current sort order.
          </CardDescription>
        </CardHeader>
        <StudentsTable students={d.students?.students ?? []} clearedLabel={stage.toLowerCase()} activeDays={ov.options.activeDays} />
      </Card>
    </>
  );
}

export function HealthView({ d }: { d: Dashboard }) {
  const { run, eventStatus: statuses, issues, placements } = d.latest;
  const ov = d.overview;
  const f = ov.filters;
  return (
    <>
      <Hero tab="health" runAt={run.runAt} />
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
            value={placements ? placements.records.toLocaleString() : "None"}
            sub={
              placements
                ? `records · imported ${fmtWhen(placements.importedAt)}${placements.source ? ` from ${placements.source}` : ""} · bun run placements`
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
                  <Badge variant={e.status === "Error" ? "destructive" : "outline"} className="ml-auto">
                    {e.status}
                  </Badge>
                  {e.results_link ? (
                    <a href={e.results_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                      <ExternalLink className="size-3" /> Open sheet
                    </a>
                  ) : (
                    <span className="text-muted-foreground">No sheet link in tracker</span>
                  )}
                  {e.error && <span className="w-full text-muted-foreground">{e.error}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Cleared = every gated section meets its QC cutoff on one attempt. Periods use the attempt date.</p>
        </CardContent>
      </Card>
    </>
  );
}
