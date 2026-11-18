/**
 * Report splits, computed from a run's attempt rows (online, offline and TR interviews).
 *
 *  - periodSplit:  competency x mode x stage (Attempted / Qualified) by period.
 *                  grain "month" = one column per month;
 *                  grain "week"  = 7-day ranges inside every month (1-7, 8-14, 15-21, 22-28, 29-end).
 *  - overallSplit: per competency, attempted / cleared / clear % for each mode, plus a total row.
 *  - yogSplit:     the overall split, per year of graduation.
 *
 *  - trLevels:     level-wise split of TR-cleared students, per competency.
 *
 * Counts are distinct candidateIds per cell. For TR counted per interview (TR_COUNT), the
 * caller makes each interview's candidateId unique ("uid#n"); student counts strip the suffix.
 * Only the chosen competencies (ids) and modes are returned. Total rows count unique students
 * across the chosen competencies (not the sum of the rows).
 */
import { weekBucket } from "./competency";

export type SplitAttempt = {
  candidateId: string;
  competency: string;
  mode: string; // "Online" | "Offline" | "TR"
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
export const SPLIT_MODES = ["Online", "Offline", "TR"] as const;

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

export function periodSplit(attempts: SplitAttempt[], grain: "month" | "week", comps: string[], modes: string[]) {
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
  for (const c of SPLIT_COMPETENCIES.filter((x) => comps.includes(x.id))) {
    for (const mode of SPLIT_MODES.filter((m) => modes.includes(m))) {
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

function competencyRows(attempts: SplitAttempt[], comps: string[], modes: string[]) {
  const att = new Map<string, Set<string>>();
  const cle = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, k: string, id: string) => {
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(id);
  };
  for (const a of attempts) {
    // "*" = all chosen competencies together (Total row, unique students)
    for (const c of [a.competency, "*"]) {
      add(att, `${c}|${a.mode}`, a.candidateId);
      if (a.qualified) add(cle, `${c}|${a.mode}`, a.candidateId);
    }
  }
  const row = (id: string, name: string): OverallRow => ({
    competency: name,
    modes: Object.fromEntries(
      SPLIT_MODES.filter((m) => modes.includes(m)).map((m) => {
        const a = att.get(`${id}|${m}`)?.size ?? 0;
        const cl = cle.get(`${id}|${m}`)?.size ?? 0;
        return [m, { attempted: a, cleared: cl, clearPct: pct(cl, a) }];
      })
    ),
  });
  const rows = SPLIT_COMPETENCIES.filter((c) => comps.includes(c.id)).map((c) => row(c.id, c.short));
  return { rows, total: row("*", "Total (unique students)") };
}

export function overallSplit(attempts: SplitAttempt[], comps: string[], modes: string[]) {
  const days = attempts.map((a) => a.day).sort();
  return { asOf: days[days.length - 1] ?? null, ...competencyRows(attempts, comps, modes) };
}

/** Overall split per year of graduation. Students without a YOG are grouped as "Unknown". */
export function yogSplit(attempts: SplitAttempt[], comps: string[], modes: string[]) {
  const groups = new Map<string, SplitAttempt[]>();
  for (const a of attempts) {
    const key = a.yog ?? "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const keys = [...groups.keys()].sort((x, y) => (x === "Unknown" ? 1 : y === "Unknown" ? -1 : x.localeCompare(y)));
  return keys.map((yog) => ({
    yog,
    students: new Set(groups.get(yog)!.map((a) => a.candidateId.split("#")[0])).size,
    ...competencyRows(groups.get(yog)!, comps, modes),
  }));
}

const LEVEL_ORDER = ["Below L1", "Below L2", "L1", "L2", "L3", "L4"];

/**
 * Level of each TR-cleared candidateId (its latest cleared interview), counted per competency.
 * Rows without a level are counted as "No level".
 */
export function trLevelSplit(
  rows: { candidateId: string; competency: string; day: string; cleared: boolean; level: string | null }[],
  comps: string[]
) {
  const latest = new Map<string, { competency: string; day: string; level: string }>();
  for (const r of rows) {
    if (!r.cleared) continue;
    const k = `${r.competency}|${r.candidateId}`;
    const prev = latest.get(k);
    if (!prev || r.day >= prev.day) latest.set(k, { competency: r.competency, day: r.day, level: r.level ?? "No level" });
  }
  const rank = (l: string) => (LEVEL_ORDER.includes(l) ? LEVEL_ORDER.indexOf(l) : LEVEL_ORDER.length);
  return SPLIT_COMPETENCIES.filter((c) => comps.includes(c.id)).map((c) => {
    const counts = new Map<string, number>();
    for (const v of latest.values()) if (v.competency === c.id) counts.set(v.level, (counts.get(v.level) ?? 0) + 1);
    const levels = [...counts.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
      .map(([level, count]) => ({ level, count }));
    return { competency: c.short, levels };
  });
}
