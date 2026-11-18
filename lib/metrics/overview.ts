/**
 * Overview numbers for the filtered rows (see filters.ts).
 *
 *  - attempted / cleared: distinct students; cleared = cleared at least one competency in the
 *    selection. Unevaluable attempts are left out of every denominator unless the toggle is on.
 *  - reattempt %: students with 2+ attempts (attempt number >= 2) in a competency / students
 *    attempted. Overall: 2+ attempts in at least one competency / students attempted.
 *  - re-attempts to clear: per student x competency x track (assessments / TR) that cleared,
 *    attempt number of the first qualifying attempt - 1.
 *  - re-attempts so far: the same, plus never-cleared pairs counted as (attempts so far - 1).
 *  - periods: the clearance-stage trend (students who attempted / cleared CLEARANCE_STAGE) per
 *    month or 7-day range, bucketed by the date of the attempt at that stage.
 *  - assessment clearance: students who cleared CLEARANCE_STAGE / students who attempted it
 *    ("both" = cleared offline and TR in the same competency / attempted offline).
 *  - funnel: Online attempted -> cleared -> Offline attempted -> cleared -> TR attempted -> cleared,
 *    for the selected modes. Each stage counts every student who reached it in a competency,
 *    whatever their path. Conversions are same-student (same competency): of students who
 *    cleared a mode, the share who attempted the next. Students who attempted a mode without
 *    clearing the previous one in that competency are reported as "off path".
 */
import { weekBucket } from "./competency";
import { CLEARANCE_STAGE, POOL_ENTRY_STAGE, type Stage } from "./config";
import type { Row } from "./filters";

const pct = (num: number, den: number) => (den ? Math.round((10000 * num) / den) / 100 : null);

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const stats = (values: number[]) => ({
  mean: values.length ? Math.round((100 * values.reduce((s, v) => s + v, 0)) / values.length) / 100 : null,
  median: median(values),
  pairs: values.length,
});

function reattempts(rows: Row[]) {
  const pairs = new Map<string, { firstClear: number | null; maxNo: number }>();
  for (const r of rows) {
    const k = `${r.candidateId}|${r.competency}|${r.mode === "TR" ? "TR" : "A"}`;
    const p = pairs.get(k) ?? { firstClear: null, maxNo: 0 };
    p.maxNo = Math.max(p.maxNo, r.attemptNo);
    if (r.qualified && (p.firstClear === null || r.attemptNo < p.firstClear)) p.firstClear = r.attemptNo;
    pairs.set(k, p);
  }
  const toClear: number[] = [];
  const soFar: number[] = [];
  for (const p of pairs.values()) {
    if (p.firstClear !== null) toClear.push(p.firstClear - 1);
    soFar.push(p.firstClear !== null ? p.firstClear - 1 : p.maxNo - 1);
  }
  return { toClear: stats(toClear), soFar: stats(soFar) };
}

function counts(rows: Row[]) {
  const attempted = new Set(rows.map((r) => r.candidateId));
  const cleared = new Set(rows.filter((r) => r.qualified).map((r) => r.candidateId));
  const multi = new Set(rows.filter((r) => r.attemptNo >= 2).map((r) => r.candidateId));
  return {
    attempted: attempted.size,
    cleared: cleared.size,
    clearancePct: pct(cleared.size, attempted.size),
    reattempted: multi.size,
    reattemptPct: pct(multi.size, attempted.size),
  };
}

export function overview(rows: Row[], unevaluableRows: Row[], comps: string[], grain: "month" | "week") {
  const periods = stagePeriods(rows, CLEARANCE_STAGE, grain);
  const total = counts(rows);
  return {
    attemptedStudents: total.attempted,
    clearedStudents: total.cleared,
    clearancePct: total.clearancePct,
    reattemptedStudents: total.reattempted,
    reattemptPct: total.reattemptPct,
    reattempts: reattempts(rows),
    unevaluable: { rows: unevaluableRows.length, students: new Set(unevaluableRows.map((r) => r.candidateId)).size },
    byCompetency: comps.map((c) => ({
      competency: c,
      ...counts(rows.filter((r) => r.competency === c)),
      unevaluableRows: unevaluableRows.filter((r) => r.competency === c).length,
    })),
    periods,
  };
}

const MODE_ORDER = ["Online", "Offline", "TR"] as const;

/** Rows that make up a stage: attempts at its mode, and the qualifying ones ("both": TR clears in a competency also cleared offline). */
function stageRows(rows: Row[], stage: Stage) {
  const mode = stage === "tr" ? "TR" : "Offline";
  const attempts = rows.filter((r) => r.mode === mode);
  if (stage !== "both") return { attempts, clears: attempts.filter((r) => r.qualified) };
  const off = new Set(rows.filter((r) => r.mode === "Offline" && r.qualified).map((r) => `${r.candidateId}|${r.competency}`));
  return { attempts, clears: rows.filter((r) => r.mode === "TR" && r.qualified && off.has(`${r.candidateId}|${r.competency}`)) };
}

/**
 * Trend for the clearance stage: distinct students who attempted / cleared it per month or
 * 7-day range, bucketed by the date of the attempt at that stage ("both": cleared is bucketed by
 * the TR date).
 */
function stagePeriods(rows: Row[], stage: Stage, grain: "month" | "week") {
  const bucket = (day: string) => (grain === "month" ? `${day.slice(0, 7)}-01` : weekBucket(day).start);
  const { attempts, clears } = stageRows(rows, stage);
  const att = new Map<string, Set<string>>();
  const cle = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, r: Row) => {
    const k = bucket(r.day);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(r.candidateId);
  };
  attempts.forEach((r) => add(att, r));
  clears.forEach((r) => add(cle, r));
  return [...new Set([...att.keys(), ...cle.keys()])].sort().map((start) => {
    const a = att.get(start)?.size ?? 0;
    const c = cle.get(start)?.size ?? 0;
    return { grain, period: grain === "month" ? start.slice(0, 7) : start, periodStart: start, attempted: a, cleared: c, clearancePct: pct(c, a) };
  });
}

function stageClearance(rows: Row[], stage: Stage) {
  const { attempts, clears } = stageRows(rows, stage);
  const attempted = new Set(attempts.map((r) => r.candidateId));
  const cleared = new Set(clears.map((r) => r.candidateId));
  return { attempted: attempted.size, cleared: cleared.size, clearancePct: pct(cleared.size, attempted.size) };
}

/**
 * conversion: same-student rate from the previous stage. Within a mode it is cleared / attempted;
 * between modes it is "of students who cleared the previous mode, the share who attempted this one"
 * in the same competency (null for the first stage).
 */
export type FunnelStage = {
  mode: string;
  step: "attempted" | "cleared";
  count: number;
  conversion: { num: number; den: number; pct: number | null } | null;
};

function funnelFor(rows: Row[], modes: string[]) {
  const chain = MODE_ORDER.filter((m) => modes.includes(m)).flatMap((m) => [
    { mode: m, step: "attempted" as const },
    { mode: m, step: "cleared" as const },
  ]);
  const pairs = new Map<string, { id: string; did: Set<string> }>();
  for (const r of rows) {
    const k = `${r.candidateId}|${r.competency}`;
    if (!pairs.has(k)) pairs.set(k, { id: r.candidateId, did: new Set() });
    const p = pairs.get(k)!;
    p.did.add(`${r.mode}:attempted`);
    if (r.qualified) p.did.add(`${r.mode}:cleared`);
  }
  const key = (c: { mode: string; step: string }) => `${c.mode}:${c.step}`;
  // Stage counts: everyone who reached the stage in a competency, whatever their path.
  const reached = chain.map(() => new Set<string>());
  // Conversion: students at the previous stage, and those of them who also reached this one (same competency).
  const from = chain.map(() => new Set<string>());
  const to = chain.map(() => new Set<string>());
  const offPath: Record<string, Set<string>> = {};
  for (const p of pairs.values()) {
    chain.forEach((c, i) => {
      const here = p.did.has(key(c));
      if (here) reached[i].add(p.id);
      if (i === 0) return;
      const prev = p.did.has(key(chain[i - 1]));
      if (prev) from[i].add(p.id);
      if (prev && here) to[i].add(p.id);
      // Attempted this mode without clearing the previous one in this competency.
      if (here && !prev && c.step === "attempted") (offPath[c.mode] ??= new Set()).add(p.id);
    });
  }
  return {
    stages: chain.map((c, i) => ({
      ...c,
      count: reached[i].size,
      conversion: i === 0 ? null : { num: to[i].size, den: from[i].size, pct: pct(to[i].size, from[i].size) },
    })) as FunnelStage[],
    offPath: Object.fromEntries(Object.entries(offPath).map(([m, s]) => [m, s.size])) as Record<string, number>,
  };
}

/** Headline stage clearance and the stage funnel, overall and per competency. */
export function stages(rows: Row[], comps: string[], modes: string[]) {
  return {
    settings: { clearanceStage: CLEARANCE_STAGE, poolEntryStage: POOL_ENTRY_STAGE },
    assessment: stageClearance(rows, CLEARANCE_STAGE),
    funnel: {
      ...funnelFor(rows, modes),
      byCompetency: comps.map((c) => {
        const sub = rows.filter((r) => r.competency === c);
        return { competency: c, ...funnelFor(sub, modes), assessment: stageClearance(sub, CLEARANCE_STAGE) };
      }),
    },
  };
}
