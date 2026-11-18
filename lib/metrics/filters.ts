/**
 * Global dashboard filters, shared by every tab and kept in the URL.
 *
 *   comps=C1,C2      competencies           (missing = all)
 *   yogs=2025,2026   years of graduation    (missing = all; "Unknown" = not in the users file)
 *   modes=Offline,TR modes                  (missing = all allowed)
 *   online=1         include online data    (default off: Online is dropped from modes)
 *   from / to        YYYY-MM-DD on attempted_on / interview_on (inclusive)
 *   attempt=first|re first attempts / re-attempts only (default all)
 *   unev=1           include unevaluable attempts (qualified IS NULL); default off
 *   active=1         active students only (see ACTIVE_DAYS in config.ts)
 *
 * Attempt numbers: a student's sittings per competency, in date order, counted inside the
 * selected modes over all dates (so a date range doesn't reset them). Online and offline
 * assessments form one sequence; TR interviews form their own.
 */
import { ACTIVE_DAYS, COMPETENCIES } from "./config";
import { SPLIT_MODES } from "./splits";
import { runAttempts, runTr } from "./store";

export type Row = {
  candidateId: string;
  competency: string;
  mode: string; // "Online" | "Offline" | "TR"
  day: string; // YYYY-MM-DD
  stamp: string; // sortable date-time
  qualified: boolean | null; // null = unevaluable
  yog: string | null;
  level: string | null; // TR only
  attemptNo: number; // 1 = first sitting
  failed: string[]; // gated sections below cutoff (not-cleared assessment attempts; [] for TR)
  verdict: string | null; // TR only: Verdict Band
};

export type AttemptType = "all" | "first" | "re";
export type Filters = {
  comps: string[];
  yogs: string[];
  modes: string[];
  online: boolean;
  from: string | null;
  to: string | null;
  attempt: AttemptType;
  unevaluable: boolean;
  active: boolean;
};
export type FilterQuery = Partial<Record<"comps" | "yogs" | "modes" | "online" | "from" | "to" | "attempt" | "unev" | "active", string>>;

export const UNKNOWN_YOG = "Unknown";
const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Comma list from the query, keeping only allowed values; empty or missing = all allowed. */
export function pick(raw: string | undefined, allowed: readonly string[]) {
  const chosen = (raw ?? "").split(",").filter((v) => allowed.includes(v));
  return chosen.length ? allowed.filter((v) => chosen.includes(v)) : [...allowed];
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every attempt and TR interview of a run (TR: attempted interviews only). */
export async function loadRows(runId: string): Promise<Row[]> {
  const [base, tr] = await Promise.all([runAttempts(runId), runTr(runId)]);
  return [
    ...base.map((a) => ({ ...a, level: null, verdict: null, attemptNo: 0 })),
    ...tr.map((t) => ({
      candidateId: t.candidateId,
      competency: t.competency,
      mode: "TR",
      day: t.day,
      stamp: t.day,
      qualified: t.cleared,
      yog: t.yog,
      level: t.level,
      verdict: t.verdict,
      attemptNo: 0,
      failed: [],
    })),
  ];
}

export function applyFilters(all: Row[], q: FilterQuery) {
  const days = all.map((r) => r.day).sort();
  const asOf = days[days.length - 1] ?? null;
  const yogs = [...new Set(all.map((r) => r.yog ?? UNKNOWN_YOG))].sort((x, y) =>
    x === UNKNOWN_YOG ? 1 : y === UNKNOWN_YOG ? -1 : x.localeCompare(y)
  );
  const options = {
    competencies: Object.keys(COMPETENCIES).filter((c) => all.some((r) => r.competency === c)),
    yogs,
    modes: [...SPLIT_MODES] as string[],
    minDay: days[0] ?? null,
    maxDay: asOf,
    activeDays: ACTIVE_DAYS,
    activeFrom: asOf ? addDays(asOf, 1 - ACTIVE_DAYS) : null,
  };

  const online = q.online === "1";
  const f: Filters = {
    comps: pick(q.comps, options.competencies),
    yogs: pick(q.yogs, options.yogs),
    modes: pick(q.modes, online ? options.modes : options.modes.filter((m) => m !== "Online")),
    online,
    from: isDay(q.from) ? q.from! : null,
    to: isDay(q.to) ? q.to! : null,
    attempt: q.attempt === "first" || q.attempt === "re" ? q.attempt : "all",
    unevaluable: q.unev === "1",
    active: q.active === "1",
  };

  // Attempt numbers inside the selected modes, over all dates.
  const seqs = new Map<string, Row[]>();
  for (const r of all) {
    if (!f.modes.includes(r.mode)) continue;
    const k = `${r.candidateId}|${r.competency}|${r.mode === "TR" ? "TR" : "A"}`;
    if (!seqs.has(k)) seqs.set(k, []);
    seqs.get(k)!.push(r);
  }
  const numbered: Row[] = [];
  for (const items of seqs.values()) {
    items.sort((x, y) => (x.stamp < y.stamp ? -1 : x.stamp > y.stamp ? 1 : 0));
    items.forEach((r, i) => numbered.push({ ...r, attemptNo: i + 1 }));
  }

  // Active = any sitting (any mode, any competency) in the last ACTIVE_DAYS days of the data.
  const activeSet = new Set(options.activeFrom ? all.filter((r) => r.day >= options.activeFrom!).map((r) => r.candidateId) : []);

  const base = numbered.filter(
    (r) =>
      f.comps.includes(r.competency) &&
      f.yogs.includes(r.yog ?? UNKNOWN_YOG) &&
      (!f.from || r.day >= f.from) &&
      (!f.to || r.day <= f.to) &&
      (f.attempt === "all" || (f.attempt === "first" ? r.attemptNo === 1 : r.attemptNo > 1)) &&
      (!f.active || activeSet.has(r.candidateId))
  );
  const unevaluableRows = base.filter((r) => r.qualified === null);
  return {
    filters: f,
    options,
    rows: f.unevaluable ? base : base.filter((r) => r.qualified !== null),
    unevaluableRows,
    isActive: (id: string) => activeSet.has(id),
  };
}
