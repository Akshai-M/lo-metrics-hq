/**
 * Overview pipeline: offline cleared -> TR cleared -> assessed pool -> placed.
 *
 *  - offline cleared / TR cleared: distinct students who cleared that mode in the selection.
 *  - assessed pool: students who cleared TR (pool entry = their first TR clear). Same students as
 *    TR cleared; kept as its own number because the pool is what placement tracks.
 *  - placed: pool students with a placement record dated on or after their pool entry.
 *  - sitting TR: distinct students with a TR interview attempt (any outcome).
 *  - growth: each headline number is split by the month it happened in (a student counts in the
 *    month of their first clear / entry / placement, so the months add up to the total).
 *    Growth = latest month vs the month before it.
 *  - per competency: the same numbers per competency. A student who clears two competencies is
 *    counted in both rows, so the rows don't add up to the totals.
 */
import { stageRows } from "./overview";
import type { Row } from "./filters";
import type { Placement } from "./placements";

const pct = (num: number, den: number) => (den ? Math.round((10000 * num) / den) / 100 : null);

/** Earliest day per key. */
function firstDay(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k) || r.day < m.get(k)!) m.set(k, r.day);
  }
  return m;
}

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export type Growth = {
  value: number; // distinct students, all months
  latestMonth: string | null; // YYYY-MM
  previousMonth: string | null;
  latest: number;
  previous: number;
  changePct: number | null; // null when the previous month is empty (nothing to compare with)
};

/** `firsts`: student -> the day that counts for this number. */
function growth(firsts: Map<string, string>, asOf: string | null): Growth {
  const months = [...firsts.values()].map((d) => d.slice(0, 7));
  const latestMonth = asOf ? asOf.slice(0, 7) : null;
  const previousMonth = latestMonth ? shiftMonth(latestMonth, -1) : null;
  const latest = latestMonth ? months.filter((m) => m === latestMonth).length : 0;
  const previous = previousMonth ? months.filter((m) => m === previousMonth).length : 0;
  return {
    value: firsts.size,
    latestMonth,
    previousMonth,
    latest,
    previous,
    changePct: previous ? pct(latest - previous, previous) : null,
  };
}

export type PipelineCompetency = {
  competency: string;
  offlineCleared: number;
  trSitting: number;
  trCleared: number;
  pool: number;
  placed: number;
  placedPct: number | null; // placed / pool
};

export type Pipeline = {
  offlineCleared: Growth;
  trCleared: Growth;
  pool: Growth;
  placed: Growth;
  trSitting: number;
  poolFromTrSitting: number | null; // pool / sitting TR
  placedFromPool: number | null; // placed / pool
  byCompetency: PipelineCompetency[];
  /** Sum of the competency rows minus the distinct total: students counted in more than one competency. */
  overlap: { offlineCleared: number; trSitting: number; trCleared: number; pool: number; placed: number };
};

export function pipeline(rows: Row[], placements: Placement[], comps: string[], asOf: string | null): Pipeline {
  // Placement records per student, earliest first.
  const byStudent = new Map<string, Placement[]>();
  for (const p of placements) {
    if (!p.day) continue;
    const id = p.candidateId.toLowerCase();
    if (!byStudent.has(id)) byStudent.set(id, []);
    byStudent.get(id)!.push(p);
  }
  for (const list of byStudent.values()) list.sort((a, b) => (a.day! < b.day! ? -1 : 1));
  const placedOnOrAfter = (id: string, day: string) => byStudent.get(id.toLowerCase())?.find((p) => p.day! >= day) ?? null;

  const offline = stageRows(rows, "offline");
  const tr = stageRows(rows, "tr");

  const offlineFirst = firstDay(offline.clears, (r) => r.candidateId);
  const poolFirst = firstDay(tr.clears, (r) => r.candidateId);
  const placedFirst = new Map<string, string>();
  for (const [id, entry] of poolFirst) {
    const p = placedOnOrAfter(id, entry);
    if (p) placedFirst.set(id, p.day!);
  }
  const trSitting = new Set(tr.attempts.map((r) => r.candidateId)).size;

  // Per competency: the pool entry is the first TR clear in that competency.
  const poolFirstByComp = firstDay(tr.clears, (r) => `${r.candidateId}|${r.competency}`);
  const byCompetency = comps.map((c) => {
    const sub = rows.filter((r) => r.competency === c);
    const offlineCleared = new Set(sub.filter((r) => r.mode === "Offline" && r.qualified).map((r) => r.candidateId)).size;
    const trSat = new Set(sub.filter((r) => r.mode === "TR").map((r) => r.candidateId)).size;
    const trClr = new Set(sub.filter((r) => r.mode === "TR" && r.qualified).map((r) => r.candidateId)).size;
    let placed = 0;
    for (const [k, entry] of poolFirstByComp) {
      const [id, comp] = k.split("|");
      if (comp === c && placedOnOrAfter(id, entry)) placed++;
    }
    return { competency: c, offlineCleared, trSitting: trSat, trCleared: trClr, pool: trClr, placed, placedPct: pct(placed, trClr) };
  });

  const pool = poolFirst.size;
  const placed = placedFirst.size;
  const sum = (k: keyof Omit<PipelineCompetency, "competency" | "placedPct">) => byCompetency.reduce((s, c) => s + c[k], 0);
  const overlap = {
    offlineCleared: sum("offlineCleared") - offlineFirst.size,
    trSitting: sum("trSitting") - trSitting,
    trCleared: sum("trCleared") - poolFirst.size,
    pool: sum("pool") - pool,
    placed: sum("placed") - placed,
  };
  return {
    overlap,
    offlineCleared: growth(offlineFirst, asOf),
    trCleared: growth(poolFirst, asOf),
    pool: growth(poolFirst, asOf),
    placed: growth(placedFirst, asOf),
    trSitting,
    poolFromTrSitting: pct(pool, trSitting),
    placedFromPool: pct(placed, pool),
    byCompetency,
  };
}

export const LEVEL_ORDER = ["L4", "L3", "L2", "L1", "Below L2", "Below L1", "No level"] as const;
export const UNDER_CONSIDERATION = ["Below L2", "Below L1"] as const;
export const VERDICT_ORDER = ["Strong Hire", "Medium Hire", "Low Hire", "Reject", "No verdict"] as const;

export type TierRow = { competency: string; attempted: number; levels: number[]; verdicts: number[] };
export type Tiers = {
  attempted: number; // distinct students with a TR interview
  levels: number[]; // aligned with LEVEL_ORDER, each student counted once at their latest interview
  verdicts: number[]; // aligned with VERDICT_ORDER
  byCompetency: TierRow[];
};

/** Level and verdict band of each student's latest TR interview (overall and per competency). */
export function tiers(rows: Row[], comps: string[]): Tiers {
  const latest = (list: Row[], key: (r: Row) => string) => {
    const m = new Map<string, Row>();
    for (const r of list) {
      const k = key(r);
      const cur = m.get(k);
      if (!cur || r.stamp > cur.stamp) m.set(k, r);
    }
    return [...m.values()];
  };
  const count = (list: Row[]): TierRow => {
    const levels = LEVEL_ORDER.map(() => 0);
    const verdicts = VERDICT_ORDER.map(() => 0);
    for (const r of list) {
      const lv = r.level && (LEVEL_ORDER as readonly string[]).includes(r.level) ? r.level : "No level";
      levels[LEVEL_ORDER.indexOf(lv as (typeof LEVEL_ORDER)[number])]++;
      const vd = r.verdict && (VERDICT_ORDER as readonly string[]).includes(r.verdict) ? r.verdict : "No verdict";
      verdicts[VERDICT_ORDER.indexOf(vd as (typeof VERDICT_ORDER)[number])]++;
    }
    return { competency: "", attempted: list.length, levels, verdicts };
  };
  const tr = rows.filter((r) => r.mode === "TR");
  const overall = count(latest(tr, (r) => r.candidateId));
  return {
    attempted: overall.attempted,
    levels: overall.levels,
    verdicts: overall.verdicts,
    byCompetency: comps.map((c) => ({
      ...count(latest(tr.filter((r) => r.competency === c), (r) => r.candidateId)),
      competency: c,
    })),
  };
}
