// Server-side data access for the page, through the Elysia API (lib/server.ts).
import { cookies } from "next/headers";
import { api } from "./server";
// The page never talks to the database directly.

export { COMPETENCIES, FILTER_KEYS, type FilterQuery } from "./shared";
import type { FilterQuery } from "./shared";
import type { Tab } from "./tabs";

export type Run = {
  runId: string;
  runAt: string;
  attemptedStudents: number;
  clearedStudents: number;
  clearancePct: number | null;
  reattemptMean: number | null;
  reattemptMedian: number | null;
  unevaluableAttemptRows: number;
  eventsInScope: number;
  eventsRead: number;
};

export type CompetencyRow = { competency: string; attempted: number; cleared: number; unevaluable: number };
export type EventStatusRow = { status: string; count: number };
export type EventIssue = {
  event_idx: number;
  competency: string | null;
  domain: string;
  mode: string;
  assessment_no: string | null;
  status: string;
  error: string | null;
  results_link: string | null;
};
export type PlacementImport = { importedAt: string; source: string | null; records: number };
export type LatestMetrics = {
  run: Run;
  competencies: CompetencyRow[];
  eventStatus: EventStatusRow[];
  issues: EventIssue[];
  placements: PlacementImport | null;
};

export type PeriodRow = {
  grain: "month" | "week";
  period: string;
  periodStart: string;
  scope: string;
  attempted: number;
  cleared: number;
  clearancePct: number | null;
};

// Calls the Elysia API in-process (same app, no network hop), passing on the visitor's
// session cookie so the API's auth guard applies to the page too.
async function call(path: string) {
  const cookie = (await cookies()).toString();
  return api.handle(new Request(`http://internal${path}`, { headers: { cookie } }));
}

/** The signed-in user, or null when the visitor has no valid session. */
export async function getMe(): Promise<{ username: string } | null> {
  const res = await call("/api/auth/me");
  return res.ok ? res.json() : null;
}


export type Filters = {
  comps: string[];
  yogs: string[];
  modes: string[];
  online: boolean;
  from: string | null;
  to: string | null;
  attempt: "all" | "first" | "re";
  unevaluable: boolean;
  active: boolean;
};
export type FilterOptions = {
  competencies: string[];
  yogs: string[];
  modes: string[];
  minDay: string | null;
  maxDay: string | null;
  activeDays: number;
  activeFrom: string | null;
};
type Counts = { attempted: number; cleared: number; clearancePct: number | null; reattempted: number; reattemptPct: number | null };
type Stats = { mean: number | null; median: number | null; pairs: number };
export type Overview = {
  runId: string;
  options: FilterOptions;
  filters: Filters;
  attemptedStudents: number;
  clearedStudents: number;
  clearancePct: number | null;
  reattemptedStudents: number;
  reattemptPct: number | null;
  reattempts: { toClear: Stats; soFar: Stats };
  unevaluable: { rows: number; students: number };
  byCompetency: (Counts & { competency: string; unevaluableRows: number })[];
  periods: Omit<PeriodRow, "scope">[];
  settings: { clearanceStage: Stage; poolEntryStage: Stage };
  assessment: StageClearance;
  funnel: Funnel & { byCompetency: (Funnel & { competency: string; assessment: StageClearance })[] };
  pipeline: Pipeline;
  tiers: Tiers;
};
export type Growth = {
  value: number;
  latestMonth: string | null; // YYYY-MM
  previousMonth: string | null;
  latest: number;
  previous: number;
  changePct: number | null;
};
export type PipelineCompetency = {
  competency: string;
  offlineCleared: number;
  trSitting: number;
  trCleared: number;
  pool: number;
  placed: number;
  placedPct: number | null;
};
export type Pipeline = {
  offlineCleared: Growth;
  trCleared: Growth;
  pool: Growth;
  placed: Growth;
  trSitting: number;
  poolFromTrSitting: number | null;
  placedFromPool: number | null;
  byCompetency: PipelineCompetency[];
  overlap: { offlineCleared: number; trSitting: number; trCleared: number; pool: number; placed: number };
};
export type Tiers = {
  attempted: number;
  levels: number[]; // aligned with levelOrder
  verdicts: number[]; // aligned with verdictOrder
  byCompetency: { competency: string; attempted: number; levels: number[]; verdicts: number[] }[];
  levelOrder: string[];
  verdictOrder: string[];
  underConsideration: string[];
};
export type Stage = "offline" | "tr" | "both";
export type StageClearance = { attempted: number; cleared: number; clearancePct: number | null };
export type FunnelStage = {
  mode: string;
  step: "attempted" | "cleared";
  count: number;
  conversion: { num: number; den: number; pct: number | null } | null; // same-student, from the previous stage
};
export type Funnel = { stages: FunnelStage[]; offPath: Record<string, number> };


export type PeriodColumn = { key: string; label: string };
export type PeriodSplitRow = { competency: string; mode: string; stage: "Attempted" | "Qualified"; values: (number | null)[] };
export type ModeCell = { attempted: number; cleared: number; clearPct: number | null };
export type OverallRow = { competency: string; modes: Record<string, ModeCell> };
export type YogGroup = { yog: string; students: number; rows: OverallRow[]; total: OverallRow };
export type TrLevels = { competency: string; levels: { level: string; count: number }[] };
export type PeriodSplit = { grain: "month" | "week"; columns: PeriodColumn[]; rows: PeriodSplitRow[]; totals: PeriodSplitRow[] };
export type Splits = {
  runId: string;
  trCount: "students" | "interviews";
  modes: string[];
  period: PeriodSplit;
  periods: { month: PeriodSplit; week: PeriodSplit };
  overall: { asOf: string | null; rows: OverallRow[]; total: OverallRow; trLevels: TrLevels[] };
  yog: YogGroup[];
};


export type Bucket = { bucket: string; count: number };
export type Reattempts = {
  runId: string;
  competency: string | null;
  pairs: number;
  clearedPairs: number;
  attemptsToClear: Bucket[];
  daysToClear: Bucket[];
  daysBetween: { median: number | null; pairs: number };
  range: { from: string | null; to: string | null };
};

export type FailureSection = { section: string; label: string; count: number; pct: number };
export type Failures = {
  runId: string;
  competencies: { competency: string; modes: { mode: string; failedAttempts: number; sections: FailureSection[] }[] }[];
};

export type StudentRow = {
  candidateId: string;
  yog: string;
  competencies: string[];
  attempts: number;
  cleared: string[];
  trLevel: string | null;
  trLevelCompetency: string | null;
  lastAttempt: string;
  active: boolean;
};

export type Count = { label: string; count: number };
export type TrOutcome = {
  attempted: number;
  cleared: number;
  clearedPct: number | null;
  interviews: number;
  verdicts: { label: string; count: number; pct: number | null }[];
};
export type Outcomes = {
  runId: string;
  placementImport: { importedAt: string | null; source: string | null; records: number };
  placement: {
    stage: Stage;
    pool: number;
    placed: number;
    placedAnyTime: number;
    poolToPlacedPct: number | null;
    notCleared: { attempted: number; placed: number; pct: number | null };
    tat: { median: number | null; mean: number | null };
    byType: Count[];
    byChannel: Count[];
    byCompetency: { competency: string; pool: number; placed: number; pct: number | null }[];
    mix: { since: string | null; placed: number; groups: Count[] };
    records: number;
  };
  tr: { count: "students" | "interviews"; total: TrOutcome; byCompetency: (TrOutcome & { competency: string })[] };
};

/** Everything one dashboard tab needs (POST /api/dashboard). Optional parts depend on the tab. */
type NoRun<T> = Omit<T, "runId">;
export type Dashboard = {
  tab: Tab;
  latest: LatestMetrics;
  overview: NoRun<Overview> & { periodsByGrain: Record<"month" | "week", Overview["periods"]> };
  splits?: NoRun<Splits>;
  failures?: NoRun<Failures>;
  reattempts?: { all: NoRun<Reattempts>; byComp: Record<string, NoRun<Reattempts>> };
  students?: { students: StudentRow[] };
  outcomes?: NoRun<Outcomes>;
};

/** Server-side: the bundle for the first render (in-process, with the visitor's session cookie). */
export async function getDashboard(tab: Tab, filters: FilterQuery = {}): Promise<Dashboard | null> {
  const cookie = (await cookies()).toString();
  const res = await api.handle(
    new Request("http://internal/api/dashboard", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tab, filters }),
    })
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API /api/dashboard returned ${res.status}`);
  return res.json() as Promise<Dashboard>;
}
