// Server-side data access for the page, through the Elysia API (lib/server.ts).
import { cookies } from "next/headers";
import { api } from "./server";
// The page never talks to the database directly.

export const COMPETENCIES: Record<string, string> = {
  C1: "Programming with Problem Solving (DSA)",
  C2: "Frontend Development",
  C3: "Software Engineering Fundamentals",
  C4: "Backend Development",
  C5: "System Design",
  C6: "Aptitude & Professional Skills",
  C7: "Generative AI Engineering",
};

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
};
export type LatestMetrics = { run: Run; competencies: CompetencyRow[]; eventStatus: EventStatusRow[]; issues: EventIssue[] };

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

async function get<T>(path: string): Promise<T | null> {
  const res = await call(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

/** The signed-in user, or null when the visitor has no valid session. */
export async function getMe(): Promise<{ username: string } | null> {
  const res = await call("/api/auth/me");
  return res.ok ? res.json() : null;
}

export const getLatestMetrics = () => get<LatestMetrics>("/api/metrics/latest");

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

/** Global filter keys kept in the URL (everything except tab and grain). */
export const FILTER_KEYS = ["comps", "yogs", "modes", "online", "from", "to", "attempt", "unev", "active"] as const;

/** Headline, trend and per-competency numbers for the global filters (a query string of FILTER_KEYS). */
export const getOverview = (grain: "month" | "week", filters: string) =>
  get<Overview>(`/api/overview?grain=${grain}${filters ? `&${filters}` : ""}`);

export type PeriodColumn = { key: string; label: string };
export type PeriodSplitRow = { competency: string; mode: string; stage: "Attempted" | "Qualified"; values: (number | null)[] };
export type ModeCell = { attempted: number; cleared: number; clearPct: number | null };
export type OverallRow = { competency: string; modes: Record<string, ModeCell> };
export type YogGroup = { yog: string; students: number; rows: OverallRow[]; total: OverallRow };
export type TrLevels = { competency: string; levels: { level: string; count: number }[] };
export type Splits = {
  runId: string;
  trCount: "students" | "interviews";
  modes: string[];
  period: { grain: "month" | "week"; columns: PeriodColumn[]; rows: PeriodSplitRow[] };
  overall: { asOf: string | null; rows: OverallRow[]; total: OverallRow; trLevels: TrLevels[] };
  yog: YogGroup[];
};

export const getSplits = (grain: "month" | "week", filters: string) =>
  get<Splits>(`/api/splits?grain=${grain}${filters ? `&${filters}` : ""}`);
