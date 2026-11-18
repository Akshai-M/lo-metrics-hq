/**
 * Placement and TR outcome views (Placement & TR tab).
 *
 * Placement (data/placements.csv, see placements.ts):
 *  - assessed pool: students who cleared POOL_ENTRY_STAGE (default offline) in the filtered rows;
 *    pool entry = date of their first clear at that stage.
 *  - placed from pool: pool students with a placement record dated on or after their pool entry
 *    (placements before the assessment don't count; "any time" is reported alongside).
 *  - pool -> placed % = placed from pool / assessed pool.
 *  - not cleared -> placed %: students who attempted that stage but never cleared it, placed on or
 *    after their first attempt there, for comparison.
 *  - TAT: days from pool entry to the first placement after it (median).
 *  - placement mix: every student placed since the first exam at the pool stage, by what they
 *    did in assessments (all assessment data, not the filters).
 *
 * TR: TR -> cleared % (interviews or students, see TR_COUNT) and the Verdict Band mix per
 * interview, per competency.
 */
import { POOL_ENTRY_STAGE, TR_COUNT } from "./config";
import type { Row } from "./filters";
import { stageRows } from "./overview";
import type { Placement } from "./placements";

const pct = (num: number, den: number) => (den ? Math.round((10000 * num) / den) / 100 : null);
const dayNo = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** First day per student (optionally per student|competency). */
function firstDay(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k) || r.day < m.get(k)!) m.set(k, r.day);
  }
  return m;
}

export const MIX = ["Cleared, then placed", "Placed, then cleared", "Attempted offline, not cleared", "Online only", "Not assessed"] as const;
export const VERDICTS = ["Strong Hire", "Medium Hire", "Low Hire", "Reject", "No verdict"] as const;

export function placementViews(rows: Row[], allRows: Row[], placements: Placement[], comps: string[]) {
  const byStudent = new Map<string, Placement[]>();
  for (const p of placements) {
    if (!p.day) continue;
    if (!byStudent.has(p.candidateId)) byStudent.set(p.candidateId, []);
    byStudent.get(p.candidateId)!.push(p);
  }
  for (const list of byStudent.values()) list.sort((a, b) => (a.day! < b.day! ? -1 : 1));
  const firstOnOrAfter = (id: string, day: string) => byStudent.get(id.toLowerCase())?.find((p) => p.day! >= day) ?? null;

  const { attempts, clears } = stageRows(rows, POOL_ENTRY_STAGE);
  const entry = firstDay(clears, (r) => r.candidateId);
  const firstTry = firstDay(attempts, (r) => r.candidateId);

  const placed = [...entry].map(([id, d]) => ({ id, entry: d, p: firstOnOrAfter(id, d) })).filter((x) => x.p);
  const anyTime = [...entry.keys()].filter((id) => byStudent.has(id.toLowerCase())).length;
  const notCleared = [...firstTry].filter(([id]) => !entry.has(id));
  const notClearedPlaced = notCleared.filter(([id, d]) => firstOnOrAfter(id, d)).length;
  const tat = placed.map((x) => dayNo(x.p!.day!) - dayNo(x.entry));

  const count = (vals: string[]) => {
    const m = new Map<string, number>();
    for (const v of vals) m.set(v || "Not given", (m.get(v || "Not given") ?? 0) + 1);
    return [...m].map(([label, n]) => ({ label, count: n })).sort((a, b) => b.count - a.count);
  };

  // Per competency: pool = cleared that competency at the pool stage; entry per competency.
  const entryByComp = firstDay(clears, (r) => `${r.candidateId}|${r.competency}`);
  const byCompetency = comps.map((c) => {
    const ids = [...entryByComp].filter(([k]) => k.endsWith(`|${c}`));
    const n = ids.filter(([k, d]) => firstOnOrAfter(k.split("|")[0], d)).length;
    return { competency: c, pool: ids.length, placed: n, pct: pct(n, ids.length) };
  });

  // Placement mix since the first exam at the pool stage (all assessment data, not the filters).
  const stageMode = POOL_ENTRY_STAGE === "tr" ? "TR" : "Offline";
  const since = allRows.filter((r) => r.mode === stageMode).reduce((m, r) => (!m || r.day < m ? r.day : m), "");
  const clearDay = firstDay(stageRows(allRows, POOL_ENTRY_STAGE).clears, (r) => r.candidateId.toLowerCase());
  const triedStage = new Set(allRows.filter((r) => r.mode === stageMode).map((r) => r.candidateId.toLowerCase()));
  const assessed = new Set(allRows.map((r) => r.candidateId.toLowerCase()));
  const mixCount = new Map<string, number>(MIX.map((m) => [m, 0]));
  let placedSince = 0;
  for (const [id, list] of byStudent) {
    const p = since ? list.find((x) => x.day! >= since) : null;
    if (!p) continue;
    placedSince++;
    const cd = clearDay.get(id);
    const group = cd ? (cd <= p.day! ? MIX[0] : MIX[1]) : triedStage.has(id) ? MIX[2] : assessed.has(id) ? MIX[3] : MIX[4];
    mixCount.set(group, mixCount.get(group)! + 1);
  }

  return {
    stage: POOL_ENTRY_STAGE,
    pool: entry.size,
    placed: placed.length,
    placedAnyTime: anyTime,
    poolToPlacedPct: pct(placed.length, entry.size),
    notCleared: { attempted: notCleared.length, placed: notClearedPlaced, pct: pct(notClearedPlaced, notCleared.length) },
    tat: { median: median(tat), mean: tat.length ? Math.round((10 * tat.reduce((s, v) => s + v, 0)) / tat.length) / 10 : null },
    byType: count(placed.map((x) => x.p!.placementType)),
    byChannel: count(placed.map((x) => x.p!.placedThrough)),
    byCompetency,
    mix: { since: since || null, placed: placedSince, groups: MIX.map((g) => ({ label: g, count: mixCount.get(g)! })) },
    records: placements.length,
  };
}

export function trViews(rows: Row[], comps: string[]) {
  const tr = rows.filter((r) => r.mode === "TR");
  const one = (list: Row[]) => {
    const attempted = TR_COUNT === "interviews" ? list.length : new Set(list.map((r) => r.candidateId)).size;
    const cleared = TR_COUNT === "interviews" ? list.filter((r) => r.qualified).length : new Set(list.filter((r) => r.qualified).map((r) => r.candidateId)).size;
    const v = new Map<string, number>(VERDICTS.map((x) => [x, 0]));
    for (const r of list) {
      const k = (VERDICTS as readonly string[]).includes(r.verdict ?? "") ? r.verdict! : "No verdict";
      v.set(k, v.get(k)! + 1);
    }
    return {
      attempted,
      cleared,
      clearedPct: pct(cleared, attempted),
      interviews: list.length,
      verdicts: VERDICTS.map((label) => ({ label, count: v.get(label)!, pct: pct(v.get(label)!, list.length) })),
    };
  };
  return {
    count: TR_COUNT,
    total: one(tr),
    byCompetency: comps.map((c) => ({ competency: c, ...one(tr.filter((r) => r.competency === c)) })).filter((c) => c.interviews > 0),
  };
}
