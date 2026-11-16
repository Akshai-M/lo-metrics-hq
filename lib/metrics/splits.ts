/**
 * Report splits, computed from a run's attempt rows (online + offline; TR comes later).
 *
 *  - periodSplit:  competency x mode x stage (Attempted / Qualified) by period.
 *                  grain "month" = one column per month;
 *                  grain "week"  = 7-day ranges inside every month (1-7, 8-14, 15-21, 22-28, 29-end).
 *  - overallSplit: per competency, attempted / cleared / clear % for each mode, plus a total row.
 *  - yogSplit:     the overall split, per year of graduation.
 *
 * Counts are distinct students: a student counts once per cell.
 */
import { weekBucket } from "./competency";

export type SplitAttempt = {
  candidateId: string;
  competency: string;
  mode: string; // "Online" | "Offline"
  day: string; // YYYY-MM-DD
  qualified: boolean | null;
  yog: string | null;
};

/** Report order and short names, as used by the team. */
export const SPLIT_COMPETENCIES: { id: string; short: string }[] = [
  { id: "C1", short: "DSA" },
  { id: "C2", short: "FE" },
  { id: "C4", short: "BE" },
  { id: "C3", short: "SE" },
  { id: "C7", short: "Gen AI" },
];
export const SPLIT_MODES = ["Online", "Offline"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type PeriodColumn = { key: string; label: string };
export type PeriodSplitRow = {
  competency: string;
  mode: string;
  stage: "Attempted" | "Qualified";
  values: (number | null)[]; // null = no attempts in that period
};

function columnFor(day: string, grain: "month" | "week", multiYear: boolean): PeriodColumn {
  const [y, m] = day.split("-").map(Number);
  const suffix = multiYear ? ` ${y}` : "";
  if (grain === "month") return { key: day.slice(0, 7), label: `${MONTHS[m - 1]}${suffix}` };
  const w = weekBucket(day);
  return { key: w.start, label: `${w.label}${suffix}` };
}

export function periodSplit(attempts: SplitAttempt[], grain: "month" | "week") {
  if (!attempts.length) return { grain, columns: [] as PeriodColumn[], rows: [] as PeriodSplitRow[] };
  const days = attempts.map((a) => a.day).sort();
  const multiYear = days[0].slice(0, 4) !== days[days.length - 1].slice(0, 4);

  const columns = new Map<string, PeriodColumn>();
  const attempted = new Map<string, Set<string>>();
  const qualified = new Map<string, Set<string>>();
  for (const a of attempts) {
    const col = columnFor(a.day, grain, multiYear);
    columns.set(col.key, col);
    const k = `${a.competency}|${a.mode}|${col.key}`;
    if (!attempted.has(k)) attempted.set(k, new Set());
    attempted.get(k)!.add(a.candidateId);
    if (a.qualified) {
      if (!qualified.has(k)) qualified.set(k, new Set());
      qualified.get(k)!.add(a.candidateId);
    }
  }
  const cols = [...columns.values()].sort((x, y) => (x.key < y.key ? -1 : 1));

  const rows: PeriodSplitRow[] = [];
  for (const c of SPLIT_COMPETENCIES) {
    for (const mode of SPLIT_MODES) {
      for (const stage of ["Attempted", "Qualified"] as const) {
        const src = stage === "Attempted" ? attempted : qualified;
        const values = cols.map((col) => {
          const att = attempted.get(`${c.id}|${mode}|${col.key}`)?.size ?? 0;
          if (!att) return null;
          return src.get(`${c.id}|${mode}|${col.key}`)?.size ?? 0;
        });
        rows.push({ competency: c.short, mode, stage, values });
      }
    }
  }
  return { grain, columns: cols, rows };
}

export type ModeCell = { attempted: number; cleared: number; clearPct: number | null };
export type OverallRow = { competency: string; modes: Record<string, ModeCell> };

const pct = (n: number, d: number) => (d ? Math.round((10000 * n) / d) / 100 : null);

function competencyRows(attempts: SplitAttempt[]) {
  const att = new Map<string, Set<string>>();
  const cle = new Map<string, Set<string>>();
  for (const a of attempts) {
    const k = `${a.competency}|${a.mode}`;
    if (!att.has(k)) att.set(k, new Set());
    att.get(k)!.add(a.candidateId);
    if (a.qualified) {
      if (!cle.has(k)) cle.set(k, new Set());
      cle.get(k)!.add(a.candidateId);
    }
  }
  const rows: OverallRow[] = SPLIT_COMPETENCIES.map((c) => ({
    competency: c.short,
    modes: Object.fromEntries(
      SPLIT_MODES.map((m) => {
        const a = att.get(`${c.id}|${m}`)?.size ?? 0;
        const cl = cle.get(`${c.id}|${m}`)?.size ?? 0;
        return [m, { attempted: a, cleared: cl, clearPct: pct(cl, a) }];
      })
    ),
  }));
  // Total row: sums of the competency rows; clear % = total cleared / total attempted.
  const total: OverallRow = {
    competency: "Total",
    modes: Object.fromEntries(
      SPLIT_MODES.map((m) => {
        const a = rows.reduce((s, r) => s + r.modes[m].attempted, 0);
        const cl = rows.reduce((s, r) => s + r.modes[m].cleared, 0);
        return [m, { attempted: a, cleared: cl, clearPct: pct(cl, a) }];
      })
    ),
  };
  return { rows, total };
}

export function overallSplit(attempts: SplitAttempt[]) {
  const days = attempts.map((a) => a.day).sort();
  return { asOf: days[days.length - 1] ?? null, ...competencyRows(attempts) };
}

/** Overall split per year of graduation. Students without a YOG are grouped as "Unknown". */
export function yogSplit(attempts: SplitAttempt[]) {
  const groups = new Map<string, SplitAttempt[]>();
  for (const a of attempts) {
    const key = a.yog ?? "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const keys = [...groups.keys()].sort((x, y) => (x === "Unknown" ? 1 : y === "Unknown" ? -1 : x.localeCompare(y)));
  return keys.map((yog) => ({
    yog,
    students: new Set(groups.get(yog)!.map((a) => a.candidateId)).size,
    ...competencyRows(groups.get(yog)!),
  }));
}
