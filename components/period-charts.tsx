"use client";

import { Fragment, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRightIcon, CalendarIcon } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, usePlotArea, XAxis, YAxis } from "recharts";
import type { ModeCell, PeriodSplit, PeriodSplitRow, Splits } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MultiSelect } from "@/components/filters";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchDashboard } from "@/lib/dashboard-client";
import type { FilterQuery } from "@/lib/shared";
import { cn } from "@/lib/utils";

// Same mode colours as the rest of the dashboard; the line uses the darker text shade of the mode.
const MODE_COLOR: Record<string, string> = {
  Online: "var(--online)",
  Offline: "var(--offline)",
  TR: "var(--tr)",
};
const MODE_LINE: Record<string, string> = {
  Online: "var(--online-text)",
  Offline: "var(--offline-text)",
  TR: "var(--tr-text)",
};
type Grain = "month" | "week";
// % axis: 0-100 sits in the upper part of the plot, the bars below it.
const PCT_DOMAIN: [number, number] = [-110, 145];
type Point = Record<string, string | number | boolean | null>;

const show = (d: string) => format(parseISO(d), "d MMM yyyy");

/** First and last day of a period column (month "YYYY-MM", or a 7-day range starting "YYYY-MM-DD"). */
function columnRange(key: string, grain: Grain): [string, string] {
  const [y, m, d] = key.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (grain === "month") return [`${key}-01`, `${key}-${pad(monthEnd)}`];
  return [key, `${y}-${pad(m)}-${pad(d >= 29 ? monthEnd : d + 6)}`];
}

/** Monthly / Weekly switch, same look as the page-level segmented control. */
export function GrainTabs({ value, onChange }: { value: Grain; onChange: (g: Grain) => void }) {
  return (
    <ToggleGroup
      aria-label="Grain"
      value={[value]}
      onValueChange={(v: string[]) => v[0] && onChange(v[0] as Grain)}
      spacing={0}
      className="rounded-md border bg-muted/60 p-0.5"
    >
      {(["month", "week"] as const).map((g) => (
        <ToggleGroupItem
          key={g}
          value={g}
          size="sm"
          className="rounded-[5px]! border-0! px-3 text-muted-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-sm aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
        >
          {g === "month" ? "Monthly" : "Weekly"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** One button showing "from -> to"; opens a From calendar and a To calendar side by side. */
function RangePicker({
  from,
  to,
  min,
  max,
  onChange,
}: {
  from: string;
  to: string;
  min: string;
  max: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const day = (d: Date) => format(d, "yyyy-MM-dd");
  const side = (label: string, value: string, lo: string, hi: string, set: (d: string) => void) => (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 px-3 pt-3">
        <span className="eyebrow">{label}</span>
        <span className="text-sm font-medium">{show(value)}</span>
      </div>
      <Calendar
        mode="single"
        required
        selected={parseISO(value)}
        defaultMonth={parseISO(value)}
        disabled={[{ before: parseISO(lo) }, { after: parseISO(hi) }]}
        onSelect={(d) => d && set(day(d))}
      />
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="w-full justify-start bg-card font-normal sm:w-auto" />}>
        <CalendarIcon className="text-muted-foreground" />
        <span>{show(from)}</span>
        <ArrowRightIcon className="text-muted-foreground" />
        <span>{show(to)}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[80vh] w-auto max-w-[calc(100vw-2rem)] overflow-y-auto p-0">
        <div className="flex flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0">
          {side("From", from, min, to, (d) => onChange(d, to))}
          {side("To", to, from, max, (d) => onChange(from, d))}
        </div>
        <div className="flex items-center justify-end border-t px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The filter controls shared by the competency filter and each chart: Mode, YOG, View, Dates or Grain, Apply. */
function FilterControls({
  draft,
  setDraft,
  modes,
  yogs,
  min,
  max,
  dirty,
  loading,
  onApply,
  leading,
  applyDisabled = false,
}: {
  draft: Filters;
  setDraft: (f: (d: Filters) => Filters) => void;
  modes: string[];
  yogs: string[];
  min: string;
  max: string;
  dirty: boolean;
  loading: boolean;
  onApply: () => void;
  leading?: React.ReactNode;
  applyDisabled?: boolean;
}) {
  return (
    <div className="flex w-full flex-wrap items-end gap-2 lg:w-auto">
      {leading}
      <div className="w-full sm:w-44">
        <MultiSelect
          label="Mode"
          allLabel="All modes"
          selected={draft.modes}
          options={modes.map((m) => ({ value: m, label: m }))}
          onChange={(next) => setDraft((d) => ({ ...d, modes: next }))}
        />
      </div>
      <div className="w-full sm:w-40">
        <MultiSelect
          label="YOG"
          allLabel="All YOGs"
          allowEmpty
          selected={draft.yogs}
          options={yogs.map((y) => ({ value: y, label: y }))}
          onChange={(next) => setDraft((d) => ({ ...d, yogs: next }))}
        />
      </div>
      <div className="flex w-full flex-col gap-1 sm:w-auto">
        <span className="eyebrow">View</span>
        <ViewTabs value={draft.view} onChange={(v) => setDraft((d) => (v === "grain" ? { ...d, view: v, from: min, to: max } : { ...d, view: v }))} />
      </div>
      {draft.view === "dates" ? (
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <span className="eyebrow">Dates</span>
          <RangePicker from={draft.from} to={draft.to} min={min} max={max} onChange={(f, t) => setDraft((d) => ({ ...d, from: f, to: t }))} />
        </div>
      ) : (
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <span className="eyebrow">Grain</span>
          <Select
            value={draft.grain}
            items={[
              { value: "month", label: "Monthly" },
              { value: "week", label: "Weekly" },
            ]}
            onValueChange={(v) => setDraft((d) => ({ ...d, grain: v as Grain }))}
          >
            <SelectTrigger className="w-full bg-card sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width) max-w-[calc(100vw-2rem)]">
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <Button disabled={!dirty || loading || draft.yogs.length === 0 || applyDisabled} onClick={onApply} className="w-full sm:w-auto">
        {loading && <Spinner />}
        Apply
      </Button>
    </div>
  );
}

/** Loads the splits for a YOG subset or a date range; null = the page data already has them. */
async function loadSplits(f: Filters, yogs: string[], min: string, max: string): Promise<Splits | null> {
  const allYogs = yogs.every((y) => f.yogs.includes(y));
  const ranged = f.view === "dates" && (f.from !== min || f.to !== max);
  if (allYogs && !ranged) return null;
  const params: FilterQuery = {};
  if (!allYogs) params.yogs = f.yogs.join(",");
  if (ranged) Object.assign(params, { from: f.from, to: f.to });
  const bundle = await fetchDashboard("splits", params);
  const splits = bundle.splits as Splits | undefined;
  if (!splits?.periods) throw new Error("no data");
  return splits;
}

/**
 * Period & mode split as charts: one for all competencies together (a student who sat two of
 * them counts once) and one per competency. Each chart has its own Mode, YOG, View, Dates or Grain
 * filters with Apply. The competency filter below the overall chart has the same controls: its
 * Apply sets them on every competency chart at once (and picks which competencies are shown).
 */
export function PeriodModeCharts({
  periods,
  overall,
  modes,
  yogs,
  names,
}: {
  periods: Splits["periods"];
  overall: OverallSplit;
  modes: string[];
  yogs: string[];
  names: Record<string, string>; // short name (DSA) -> full name
}) {
  const comps = [...new Set([...periods.month.rows, ...periods.week.rows].map((r) => r.competency))];
  const months = periods.month.columns;
  const min = months.length ? columnRange(months[0].key, "month")[0] : "";
  const max = months.length ? columnRange(months[months.length - 1].key, "month")[1] : "";
  const initial: Filters = { modes, yogs, view: "grain", from: min, to: max, grain: "month" };
  const [gDraft, setGDraft] = useState<Filters>(initial);
  const [gComps, setGComps] = useState<string[]>(comps);
  const [gLoading, setGLoading] = useState(false);
  const [gError, setGError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ filters: initial, comps, version: 0, splits: null });
  const gDirty = JSON.stringify(gDraft) !== JSON.stringify(sync.filters) || JSON.stringify(gComps) !== JSON.stringify(sync.comps);

  async function applyGlobal() {
    setGError(null);
    setGLoading(true);
    try {
      const splits = await loadSplits(gDraft, yogs, min, max);
      setSync((s) => ({ filters: gDraft, comps: gComps, version: s.version + 1, splits }));
    } catch (e) {
      setGError(`Could not load data for the selected filters (${e instanceof Error ? e.message : "error"}).`);
    } finally {
      setGLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Bars: qualified students, labelled qualified / attempted. Line: that period&apos;s clearance % (qualified ÷ attempted distinct students). On
          each dotted line: the difference in clearance % from the previous period (▲ up, ▼ down), coloured by mode.
        </p>
      </div>
      <PeriodChart
        title="All competencies"
        note="Students counted once across competencies"
        pick={(p) => p.totals}
        overall={overall}
        overallOf={(o) => o.total.modes}
        periods={periods}
        modes={modes}
        yogs={yogs}
      />
      <Card className="min-w-0 gap-0 rounded-lg py-0">
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="eyebrow">Competency filter</span>
            <span className="text-xs text-muted-foreground">Applies to every competency chart below. Pick which competencies to show.</span>
          </div>
          <FilterControls
            draft={gDraft}
            setDraft={setGDraft}
            modes={modes}
            yogs={yogs}
            min={min}
            max={max}
            dirty={gDirty}
            loading={gLoading}
            onApply={() => void applyGlobal()}
            applyDisabled={gComps.length === 0}
            leading={
              <div className="w-full sm:w-56">
                <MultiSelect
                  label="Competency"
                  allLabel="All competencies"
                  selected={gComps}
                  options={comps.map((c) => ({ value: c, label: names[c] ?? c }))}
                  onChange={setGComps}
                />
              </div>
            }
          />
          {gError && <p className="text-sm text-destructive">{gError}</p>}
        </div>
      </Card>
      {comps
        .filter((c) => sync.comps.includes(c))
        .map((c) => (
          <PeriodChart
            key={c}
            title={names[c] ?? c}
            pick={(p) => p.rows.filter((r) => r.competency === c)}
            overall={overall}
            overallOf={(o) => o.rows.find((r) => r.competency === c)?.modes}
            periods={periods}
            modes={modes}
            yogs={yogs}
            sync={sync}
          />
        ))}
    </div>
  );
}

type View = "dates" | "grain";
type Filters = { modes: string[]; yogs: string[]; view: View; from: string; to: string; grain: Grain };
type OverallSplit = Splits["overall"];
/** The competency filter's last Apply: its filters, competencies and (if fetched) splits. */
type SyncState = { filters: Filters; comps: string[]; version: number; splits: Splits | null };

const SEG_GROUP = "rounded-md border bg-muted/60 p-0.5";
const SEG_ITEM =
  "rounded-[5px]! border-0! px-3 text-muted-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-sm aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm";

/** Dates or Grain: the two ways a chart can be filtered by time (dates ignore the grain). */
function ViewTabs({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <ToggleGroup aria-label="View" value={[value]} onValueChange={(v: string[]) => v[0] && onChange(v[0] as View)} spacing={0} className={SEG_GROUP}>
      {(["dates", "grain"] as const).map((v) => (
        <ToggleGroupItem key={v} value={v} size="sm" className={SEG_ITEM}>
          {v === "dates" ? "By dates" : "By grain"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Adds one mode's bar, label and % for a period (att null = no attempts in that period). */
function modeKeys(m: string, att: number | null, q: number | null): Point {
  return {
    [`${m}_q`]: att === null ? null : (q ?? 0),
    [`${m}_lbl`]: att === null ? null : `${q ?? 0}/${att}`,
    [`${m}_pct`]: att ? Math.round((1000 * (q ?? 0)) / att) / 10 : null,
  };
}

function PeriodChart({
  title,
  note,
  pick,
  overall,
  overallOf,
  periods,
  modes,
  yogs,
  sync,
}: {
  title: string;
  note?: string;
  pick: (p: PeriodSplit) => PeriodSplitRow[];
  overall: OverallSplit; // page data: all YOGs, full date range
  overallOf: (o: OverallSplit) => Record<string, ModeCell> | undefined;
  periods: Splits["periods"];
  modes: string[];
  yogs: string[];
  sync?: SyncState; // the competency filter (not used by the all-competencies chart)
}) {
  const months = periods.month.columns;
  const min = months.length ? columnRange(months[0].key, "month")[0] : "";
  const max = months.length ? columnRange(months[months.length - 1].key, "month")[1] : "";
  // Draft filters change freely; the chart only follows the applied ones (its own Apply, or the competency filter's).
  const initial: Filters = { modes, yogs, view: "grain", from: min, to: max, grain: "month" };
  const [draft, setDraft] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [fetched, setFetched] = useState<Splits | null>(null); // null = page data
  const [seenVersion, setSeenVersion] = useState(sync?.version ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The competency filter was applied since this chart last looked: adopt its filters and data.
  if (sync && sync.version !== seenVersion) {
    setSeenVersion(sync.version);
    setDraft(sync.filters);
    setApplied(sync.filters);
    setFetched(sync.splits);
    setError(null);
  }
  const { view, grain, from, to } = applied;
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  async function applyOwn() {
    setError(null);
    setLoading(true);
    try {
      const splits = await loadSplits(draft, yogs, min, max);
      setFetched(splits);
      setApplied(draft);
    } catch (e) {
      setError(`Could not load data for the selected filters (${e instanceof Error ? e.message : "error"}).`);
    } finally {
      setLoading(false);
    }
  }

  const data = fetched;
  const dataPeriods = data ? data.periods : periods;
  const split = dataPeriods[grain];
  const rows = pick(split);
  const cells = overallOf(data ? data.overall : overall) ?? {};
  const dateView = view === "dates";
  // Dates view: one bar per mode over the whole range (distinct students, from the overall split).
  const rangeCells = modes
    .filter((m) => applied.modes.includes(m))
    .flatMap((m) => {
      const o = cells[m];
      return o && o.attempted > 0 ? [{ mode: m, q: o.cleared, att: o.attempted, pct: o.clearPct }] : [];
    });
  const shown = dateView
    ? rangeCells.map((c) => c.mode)
    : modes.filter((m) => applied.modes.includes(m) && rows.some((r) => r.mode === m && r.values.some((v) => v !== null)));
  const value = (mode: string, stage: string, i: number) => rows.find((r) => r.mode === mode && r.stage === stage)?.values[i] ?? null;
  // A period is kept when it overlaps From - To (grain view: the full range).
  const inRange = (key: string) => {
    const [start, end] = columnRange(key, grain);
    return end >= from && start <= to;
  };

  // Monthly numbers per mode for the same filters, shown below the chart (same for Monthly and Weekly).
  const monthSplit = dataPeriods.month;
  const monthRows = pick(monthSplit);
  const lastPct = new Map<string, number>();
  const monthly = monthSplit.columns.flatMap((c, i) => {
    const [start, end] = columnRange(c.key, "month");
    const cellsM = shown.flatMap((m) => {
      const att = monthRows.find((r) => r.mode === m && r.stage === "Attempted")?.values[i] ?? null;
      if (att === null) return [];
      const q = monthRows.find((r) => r.mode === m && r.stage === "Qualified")?.values[i] ?? 0;
      const pct = att ? Math.round((1000 * q) / att) / 10 : null;
      const prev = lastPct.get(m);
      if (pct !== null) lastPct.set(m, pct);
      return [{ mode: m, q, att, pct, change: pct === null || prev === undefined ? null : pct - prev }];
    });
    if (end < from || start > to) return [];
    return cellsM.length ? [{ label: c.label, cells: cellsM }] : [];
  });
  const overallCells: MonthCell[] = rangeCells
    .filter((c) => shown.includes(c.mode))
    .map((c) => ({ mode: c.mode, q: c.q, att: c.att, pct: c.pct, change: null }));

  const points: Point[] = dateView
    ? rangeCells.length
      ? [Object.assign({ label: `${show(from)} – ${show(to)}` }, ...rangeCells.map((c) => modeKeys(c.mode, c.att, c.q)))]
      : []
    : split.columns.flatMap((c, i) => {
        if (!inRange(c.key)) return [];
        const point: Point = Object.assign({ label: c.label }, ...shown.map((m) => modeKeys(m, value(m, "Attempted", i), value(m, "Qualified", i))));
        return shown.some((m) => point[`${m}_pct`] !== null) ? [point] : [];
      });
  const maxQ = Math.max(1, ...points.flatMap((p) => shown.map((m) => Number(p[`${m}_q`] ?? 0))));
  const config = Object.fromEntries(shown.map((m) => [m, { label: m, color: MODE_COLOR[m] }])) satisfies ChartConfig;
  // Room per period for every mode's bar label (e.g. "123/456") side by side.
  const minWidth = points.length * (shown.length * 58 + 28);

  return (
    <Card className="min-w-0 gap-0 rounded-lg py-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {min && !sync && (
          <FilterControls
            draft={draft}
            setDraft={setDraft}
            modes={modes}
            yogs={yogs}
            min={min}
            max={max}
            dirty={dirty}
            loading={loading}
            onApply={() => void applyOwn()}
          />
        )}
      </div>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!points.length ? (
          <p className="text-sm text-muted-foreground">No data for this selection.</p>
        ) : (
          <>
            <Legend modes={shown} />
            <div className="flex flex-col gap-4">
              <div className="min-w-0 flex-1 overflow-x-auto pb-3">
                <ChartContainer config={config} className="aspect-auto h-[340px] w-full" style={{ minWidth }}>
                  <ComposedChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4} barCategoryGap="22%">
                    <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--grid)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} interval={0} />
                    {/* Bars use the lower part of the plot, the % line the upper part, so labels don't collide. */}
                    <YAxis yAxisId="n" hide domain={[0, maxQ * 2.6]} />
                    <YAxis yAxisId="pct" hide domain={PCT_DOMAIN} />
                    {shown.map((m) => (
                      <Bar
                        key={`${m}_q`}
                        yAxisId="n"
                        dataKey={`${m}_q`}
                        fill={MODE_COLOR[m]}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={44}
                        isAnimationActive={false}
                      >
                        <LabelList dataKey={`${m}_lbl`} position="top" className="fill-foreground font-mono text-[10px]" />
                      </Bar>
                    ))}
                    {shown.map((m) => (
                      <Line
                        key={`${m}_pct`}
                        yAxisId="pct"
                        dataKey={`${m}_pct`}
                        stroke={MODE_LINE[m]}
                        strokeWidth={2}
                        dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
                        activeDot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ))}
                    <LineLabels points={points} modes={shown} />
                    <Deltas points={points} modes={shown} />
                  </ComposedChart>
                </ChartContainer>
              </div>
              {(monthly.length > 0 || overallCells.length > 0) && <MonthlyPanel months={monthly} overall={overallCells} modes={shown} />}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** Below the chart: a table with the overall row first, then one row per month. Per mode: qualified / attempted and clearance %. */
type MonthCell = {
  mode: string;
  q: number;
  att: number;
  pct: number | null;
  change: number | null;
};
type Overall = MonthCell[];
const TEXT_OF: Record<string, string> = {
  Online: "text-online-text",
  Offline: "text-offline-text",
  TR: "text-tr-text",
};
const DOT_OF: Record<string, string> = {
  Online: "bg-online",
  Offline: "bg-offline",
  TR: "bg-tr",
};

function MonthlyPanel({ months, overall, modes }: { months: { label: string; cells: MonthCell[] }[]; overall: Overall; modes: string[] }) {
  const pick = (cells: MonthCell[], m: string) => cells.find((c) => c.mode === m) ?? null;
  // Two columns per mode: qualified / attempted, and clearance % (with the change from the previous month).
  const modeCells = (m: string, cell: MonthCell | null, bordered: boolean, muted = false) => (
    <Fragment key={m}>
      <TableCell className={cn("text-right font-mono tabular-nums", bordered && "border-l", muted && "bg-muted/40")}>
        {cell ? `${cell.q.toLocaleString()} / ${cell.att.toLocaleString()}` : <span className="text-muted-foreground/60">–</span>}
      </TableCell>
      <TableCell className={cn("text-right", muted && "bg-muted/40")}>
        {cell ? (
          <span className="inline-flex items-center justify-end gap-1.5">
            {cell.change !== null && (
              <span
                className="text-[10px] leading-none"
                style={{ color: MODE_LINE[cell.mode] }}
                title={`${cell.change > 0 ? "+" : ""}${cell.change.toFixed(1)}% vs previous month`}
              >
                {cell.change > 0 ? "▲" : cell.change < 0 ? "▼" : "="}
              </span>
            )}
            <span className="font-mono font-semibold tabular-nums">{cell.pct === null ? "–" : `${cell.pct}%`}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/60">–</span>
        )}
      </TableCell>
    </Fragment>
  );
  return (
    <div className="rounded-md border">
      <div className="flex flex-col gap-0.5 border-b px-4 py-3">
        <span className="eyebrow">Monthly view</span>
        <span className="text-[11px] text-muted-foreground">
          Qualified / attempted and clearance % per mode. ▲ ▼ = change from the previous month.
        </span>
      </div>
      <Table className="tabular">
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead rowSpan={2} className="sticky left-0 z-10 bg-muted pl-4 align-bottom">
              Period
            </TableHead>
            {modes.map((m, i) => (
              <TableHead key={m} colSpan={2} className={cn("text-center", i > 0 && "border-l")}>
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TEXT_OF[m])}>
                  <span className={cn("size-2 rounded-full", DOT_OF[m])} />
                  {m}
                </span>
              </TableHead>
            ))}
          </TableRow>
          <TableRow className="hover:bg-transparent">
            {modes.map((m, i) => (
              <Fragment key={m}>
                <TableHead className={cn("text-right text-xs font-normal text-muted-foreground", i > 0 && "border-l")}>
                  Qualified / attempted
                </TableHead>
                <TableHead className="text-right text-xs font-normal text-muted-foreground">Clearance %</TableHead>
              </Fragment>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {overall.length > 0 && (
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell className="sticky left-0 z-10 bg-muted pl-4">Overall</TableCell>
              {modes.map((m, i) => modeCells(m, pick(overall, m), i > 0, true))}
            </TableRow>
          )}
          {months.map((mo) => (
            <TableRow key={mo.label}>
              <TableCell className="sticky left-0 z-10 bg-card pl-4 font-medium">{mo.label}</TableCell>
              {modes.map((m, i) => modeCells(m, pick(mo.cells, m), i > 0))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Legend({ modes }: { modes: string[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {modes.map((m) => (
        <span key={m} className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm" style={{ background: MODE_COLOR[m] }} />
            {m} qualified
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: MODE_LINE[m] }} />
            {m} clearance %
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Clearance % above each line dot. When modes are close in a period, a label that would hit
 * another label or dot moves under its own dot, then further down until it is clear.
 */
function LineLabels({ points, modes }: { points: Point[]; modes: string[] }) {
  const plot = usePlotArea();
  if (!plot || !points.length) return null;
  const band = plot.width / points.length;
  const [lo, hi] = PCT_DOMAIN;
  const yOf = (v: number) => plot.y + (plot.height * (hi - v)) / (hi - lo);
  const labels: {
    key: string;
    x: number;
    y: number;
    mode: string;
    v: number;
  }[] = [];
  points.forEach((p, i) => {
    const x = plot.x + (i + 0.5) * band;
    const items = modes
      .filter((m) => p[`${m}_pct`] !== null && p[`${m}_pct`] !== undefined)
      .map((m) => ({
        mode: m,
        v: Number(p[`${m}_pct`]),
        dot: yOf(Number(p[`${m}_pct`])),
      }))
      .sort((a, b) => a.dot - b.dot);
    const placed: number[] = [];
    const hitsLabel = (y: number) => placed.some((py) => Math.abs(py - y) < 13);
    const hitsDot = (y: number, self: number) => items.some((it, k) => k !== self && y - 10 < it.dot + 5 && y + 3 > it.dot - 5);
    items.forEach((it, k) => {
      let y = it.dot - 10;
      if (hitsLabel(y) || hitsDot(y, k)) {
        y = it.dot + 18;
        for (let guard = 0; guard < 12 && (hitsLabel(y) || hitsDot(y, k)); guard++) y += 13;
      }
      placed.push(y);
      labels.push({ key: `${i}-${it.mode}`, x, y, mode: it.mode, v: it.v });
    });
  });
  return (
    <g>
      {labels.map((l) => (
        <text
          key={l.key}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          fill={MODE_LINE[l.mode]}
          stroke="var(--card)"
          strokeWidth={4}
          paintOrder="stroke"
          className="font-mono text-[11px] font-semibold"
        >
          {l.v}%
        </text>
      ))}
    </g>
  );
}

/**
 * Dotted line between each pair of periods, with the difference in clearance % per mode from the
 * previous period that had an exam in that mode.
 */
function Deltas({ points, modes }: { points: Point[]; modes: string[] }) {
  const plot = usePlotArea();
  if (!plot || points.length < 2) return null;
  const band = plot.width / points.length;
  const last = new Map<string, number>();
  const marks: { x: number; items: { mode: string; d: number }[] }[] = [];
  points.forEach((p, i) => {
    const items: { mode: string; d: number }[] = [];
    for (const m of modes) {
      const v = p[`${m}_pct`] as number | null;
      if (v === null || v === undefined) continue;
      if (i > 0 && last.has(m)) items.push({ mode: m, d: Math.round(10 * (v - last.get(m)!)) / 10 });
      last.set(m, v);
    }
    if (i > 0) marks.push({ x: plot.x + i * band, items });
  });
  return (
    <g>
      {marks.map(({ x, items }) => (
        <g key={x}>
          <line x1={x} x2={x} y1={plot.y} y2={plot.y + plot.height} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="2 4" />
          {items.map(({ mode, d }, k) => {
            const y = plot.y + 10 + k * 14;
            const text = `${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${Math.abs(d).toFixed(1)}%`;
            return (
              <g key={mode}>
                <rect x={x - 27} y={y - 9} width={54} height={13} rx={3} fill="var(--card)" />
                <text x={x} y={y + 1} textAnchor="middle" fill={MODE_LINE[mode]} className="font-mono text-[10px] font-medium">
                  {text}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}
