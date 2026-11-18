/**
 * Student-wise table for the filtered rows (see filters.ts): one row per student.
 *  - competencies attempted / total attempts: in the selected modes (TR interviews count as attempts)
 *  - cleared competencies: cleared at CLEARANCE_STAGE (same rule as the headline)
 *  - latest TR level: level of the student's most recent TR interview with a level
 *  - active: see ACTIVE_DAYS (assumed definition)
 * ft_comp_students holds a whole-run summary (all modes, no YOG, no dates), so it can't follow
 * the filters; the rows are built from the same filtered attempts as every other view.
 */
import { CLEARANCE_STAGE, COMPETENCIES } from "./config";
import { UNKNOWN_YOG, type Row } from "./filters";
import { stageRows } from "./overview";

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

export function studentRows(rows: Row[], isActive: (id: string) => boolean): StudentRow[] {
  const cleared = new Set(stageRows(rows, CLEARANCE_STAGE).clears.map((r) => `${r.candidateId}|${r.competency}`));
  const order = Object.keys(COMPETENCIES);
  const by = new Map<string, Row[]>();
  for (const r of rows) {
    if (!by.has(r.candidateId)) by.set(r.candidateId, []);
    by.get(r.candidateId)!.push(r);
  }
  return [...by].map(([id, items]) => {
    const comps = [...new Set(items.map((r) => r.competency))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const tr = items.filter((r) => r.mode === "TR" && r.level).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))[0];
    return {
      candidateId: id,
      yog: items.find((r) => r.yog)?.yog ?? UNKNOWN_YOG,
      competencies: comps,
      attempts: items.length,
      cleared: comps.filter((c) => cleared.has(`${id}|${c}`)),
      trLevel: tr?.level ?? null,
      trLevelCompetency: tr?.competency ?? null,
      lastAttempt: items.reduce((m, r) => (r.day > m ? r.day : m), ""),
      active: isActive(id),
    };
  });
}
