/**
 * FT competency assessment logic. Pure functions, no I/O, so the internship
 * phase can reuse them with its own config.
 *
 * Definitions:
 *  - Student key ........ candidate_id
 *  - Attempt ............ results row with attempt_status === "ATTEMPTED"
 *  - Qualified .......... every gated section meets its cutoff on that attempt
 *  - Cleared student .... qualified in at least one FT competency
 *  - Re-attempts ........ per (student, competency) that cleared: attempts before the first qualifying one
 */
import {
  COMPETENCIES,
  CUTOFF_WINDOWS,
  DOMAIN_TO_COMPETENCY,
  OVERALL,
  RULESETS,
  SECTION_ALIASES,
  type CompetencyId,
} from "./config";

export type Row = Record<string, unknown>;

export type AssessmentEvent = {
  idx: number;
  assessmentStatus?: string;
  modeOfAssessment?: string;
  domain?: string;
  assessmentNumber?: string;
  resultsLink?: string | null;
};

export type Attempt = {
  candidateId: string;
  competency: CompetencyId;
  eventIdx: number;
  domain: string;
  mode: string;
  attemptedOn: string; // "YYYY-MM-DD HH:MM" (sheet-local time)
  day: string; // "YYYY-MM-DD"
  ruleset: string | null;
  qualified: boolean | null; // null = cannot evaluate
  failed: string[];
  reason: string;
  sheetQualified: boolean | null; // the sheet's manual "Qualified Status", cross-check only
  yog?: string | null; // year of graduation, from data/user_yog.csv
};

// ---------------------------------------------------------------- helpers

export function norm(text: unknown): string {
  if (text === null || text === undefined) return "";
  return String(text).replace(/["“”]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function competencyForDomain(domain: unknown): CompetencyId | null {
  return DOMAIN_TO_COMPETENCY[norm(domain)] ?? null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** Parses "Aug 14, 2026 at 09:36PM". Returns null if the format doesn't match. */
export function parseAttemptDate(text: unknown): { day: string; stamp: string } | null {
  if (!text) return null;
  const m = String(text).trim().match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  let hour = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "PM") hour += 12;
  const day = `${m[3]}-${pad(month)}-${pad(Number(m[2]))}`;
  return { day, stamp: `${day} ${pad(hour)}:${m[5]}` };
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const pct = (num: number, den: number) => (den ? Math.round((10000 * num) / den) / 100 : null);

// ---------------------------------------------------------------- qualification

/** Sections in a row: "<name> user score" columns mapped through the competency's aliases. */
export function extractSections(row: Row, competency: CompetencyId) {
  const aliases = SECTION_ALIASES[competency] ?? {};
  const sections: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const col of Object.keys(row)) {
    if (!col.endsWith(" user score")) continue;
    const raw = col.slice(0, -" user score".length);
    const key = aliases[norm(raw)];
    if (!key) {
      unknown.push(raw.trim());
      continue;
    }
    sections[key] = row[col];
  }
  // A "Final <section> Score" column (e.g. "Final Web coding Score", after manual re-marking)
  // overrides that section's user score columns.
  for (const col of Object.keys(row)) {
    const m = col.match(/^final (.+) score$/i);
    const key = m && aliases[norm(m[1])];
    if (key) sections[key] = row[col];
  }
  return { sections, unknown };
}

export function findRuleset(competency: CompetencyId, mode: string, day: string, exam?: string): string | null {
  for (const w of CUTOFF_WINDOWS) {
    if (w.competency !== competency) continue;
    if (w.mode !== "any" && w.mode !== mode) continue;
    // Exam-specific windows match on the assessment number, whatever the attempt date.
    if (w.exam) {
      if (w.exam === exam?.trim()) return w.ruleset;
      continue;
    }
    if (w.start && day < w.start) continue;
    if (w.end && day > w.end) continue;
    return w.ruleset;
  }
  return null;
}

export function evaluateAttempt(row: Row, competency: CompetencyId, mode: string, day: string, rulesetName?: string, exam?: string) {
  const ruleset = rulesetName ?? findRuleset(competency, mode, day, exam);
  const result = { qualified: null as boolean | null, ruleset, reason: "", failed: [] as string[], unknown: [] as string[] };
  if (!ruleset) {
    result.reason = "no cutoff window matches attempt date";
    return result;
  }
  const byMode = RULESETS[ruleset]?.[competency];
  if (!byMode) {
    result.reason = `ruleset ${ruleset} has no ${competency} rules`;
    return result;
  }
  const cutoffs = byMode[mode as "Online" | "Offline"] ?? byMode.any;
  if (!cutoffs) {
    result.reason = `ruleset ${ruleset} has no ${mode} rules`;
    return result;
  }

  if (OVERALL in cutoffs) {
    const score = toNumber(row["overall_candidate_score"]);
    if (score === null) {
      result.reason = "missing overall score";
      return result;
    }
    result.qualified = score >= cutoffs[OVERALL];
    if (!result.qualified) result.failed = [OVERALL];
    return result;
  }

  const { sections, unknown } = extractSections(row, competency);
  result.unknown = unknown;
  const missing: string[] = [];
  for (const [key, cutoff] of Object.entries(cutoffs)) {
    if (cutoff <= 0) continue; // ungated
    const score = key in sections ? toNumber(sections[key]) : null;
    if (score === null) missing.push(key);
    else if (score < cutoff) result.failed.push(key);
  }
  if (result.failed.length) {
    result.qualified = false;
  } else if (missing.length) {
    result.reason = `gated section(s) missing: ${missing.join(", ")}`;
  } else {
    result.qualified = true;
  }
  return result;
}

// ---------------------------------------------------------------- cleaning

export type CleanStats = { blankCandidateRowsDropped: number; duplicateRowsDropped: number };

/** Drops rows without candidate_id; keeps one row per candidate per exam, preferring ATTEMPTED. */
export function cleanRows(rows: Row[], stats: CleanStats): Row[] {
  const kept: Row[] = [];
  const byId = new Map<string, number>();
  for (const r of rows) {
    const cid = typeof r.candidate_id === "string" ? r.candidate_id.trim() : r.candidate_id ? String(r.candidate_id) : "";
    if (!cid) {
      stats.blankCandidateRowsDropped++;
      continue;
    }
    const at = byId.get(cid);
    if (at === undefined) {
      byId.set(cid, kept.length);
      kept.push(r);
      continue;
    }
    if (kept[at].attempt_status !== "ATTEMPTED" && r.attempt_status === "ATTEMPTED") kept[at] = r;
    stats.duplicateRowsDropped++;
  }
  return kept;
}

// ---------------------------------------------------------------- aggregation

export type Gaps = {
  eventsInScope: number;
  eventsOutOfScope: number;
  eventsNotRead: number;
  attemptedRowsOutOfScope: number;
  rowsBadDate: number;
  rowsNoCutoffWindow: number;
  rowsUnevaluable: number;
  unknownSectionNames: string[];
  agreeWithSheet: number;
  disagreeWithSheet: number;
};

export function buildAttempts(eventsWithRows: { event: AssessmentEvent; rows: Row[] | null }[]) {
  const attempts: Attempt[] = [];
  const unknown = new Set<string>();
  const gaps: Gaps = {
    eventsInScope: 0, eventsOutOfScope: 0, eventsNotRead: 0, attemptedRowsOutOfScope: 0,
    rowsBadDate: 0, rowsNoCutoffWindow: 0, rowsUnevaluable: 0, unknownSectionNames: [],
    agreeWithSheet: 0, disagreeWithSheet: 0,
  };

  for (const { event, rows } of eventsWithRows) {
    const competency = competencyForDomain(event.domain);
    if (!competency) {
      gaps.eventsOutOfScope++;
      gaps.attemptedRowsOutOfScope += (rows ?? []).filter((r) => r.attempt_status === "ATTEMPTED").length;
      continue;
    }
    if (!rows) {
      gaps.eventsNotRead++;
      continue;
    }
    gaps.eventsInScope++;
    const mode = String(event.modeOfAssessment ?? "").trim();

    for (const row of rows) {
      if (row.attempt_status !== "ATTEMPTED") continue;
      const when = parseAttemptDate(row.attempted_on);
      if (!when) {
        gaps.rowsBadDate++;
        continue;
      }
      const ev = evaluateAttempt(row, competency, mode, when.day, undefined, event.assessmentNumber);
      if (!ev.ruleset) gaps.rowsNoCutoffWindow++;
      if (ev.qualified === null) gaps.rowsUnevaluable++;
      ev.unknown.forEach((u) => unknown.add(u));

      const flag = norm(row["Qualified Status"]);
      const sheetQualified = flag === "qualified" ? true : flag === "not qualified" ? false : null;
      if (ev.qualified !== null && sheetQualified !== null) {
        if (ev.qualified === sheetQualified) gaps.agreeWithSheet++;
        else gaps.disagreeWithSheet++;
      }

      attempts.push({
        candidateId: String(row.candidate_id),
        competency,
        eventIdx: event.idx,
        domain: String(event.domain ?? "").trim(),
        mode,
        attemptedOn: when.stamp,
        day: when.day,
        ruleset: ev.ruleset,
        qualified: ev.qualified,
        failed: ev.failed,
        reason: ev.reason,
        sheetQualified,
      });
    }
  }
  gaps.unknownSectionNames = [...unknown].sort();
  return { attempts, gaps };
}

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function groupPairs(attempts: Attempt[]) {
  const pairs = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const k = `${a.candidateId}|${a.competency}`;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k)!.push(a);
  }
  for (const items of pairs.values()) items.sort((x, y) => (x.attemptedOn < y.attemptedOn ? -1 : x.attemptedOn > y.attemptedOn ? 1 : 0));
  return pairs;
}

export function aggregate(attempts: Attempt[]) {
  const attempted = new Set(attempts.map((a) => a.candidateId));
  const cleared = new Set(attempts.filter((a) => a.qualified).map((a) => a.candidateId));

  const perCompetency = Object.fromEntries(
    (Object.keys(COMPETENCIES) as CompetencyId[]).map((c) => {
      const items = attempts.filter((a) => a.competency === c);
      const att = new Set(items.map((a) => a.candidateId)).size;
      const cle = new Set(items.filter((a) => a.qualified).map((a) => a.candidateId)).size;
      const unev = items.filter((a) => a.qualified === null).length;
      return [c, { name: COMPETENCIES[c], attempted: att, cleared: cle, unevaluable: unev, clearancePct: pct(cle, att) }];
    })
  ) as Record<CompetencyId, { name: string; attempted: number; cleared: number; unevaluable: number; clearancePct: number | null }>;

  const reattempts: number[] = [];
  for (const items of groupPairs(attempts).values()) {
    const first = items.findIndex((a) => a.qualified);
    if (first >= 0) reattempts.push(first);
  }
  const mean = reattempts.length ? Math.round((100 * reattempts.reduce((s, v) => s + v, 0)) / reattempts.length) / 100 : null;

  return {
    attemptedStudents: attempted.size,
    clearedStudents: cleared.size,
    clearancePct: pct(cleared.size, attempted.size),
    attemptRows: attempts.length,
    unevaluableAttemptRows: attempts.filter((a) => a.qualified === null).length,
    perCompetency,
    reattempts: { pairsCleared: reattempts.length, mean, median: median(reattempts) },
  };
}

export type Metrics = ReturnType<typeof aggregate>;

export type StudentRow = {
  candidateId: string;
  clearedAny: boolean;
  competenciesAttempted: string;
  competenciesCleared: string;
  detail: Record<string, { attempts: number; firstClearOn: string | null; reattemptsToClear: number | null }>;
};

export function studentTable(attempts: Attempt[]): StudentRow[] {
  const byStudent = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (!byStudent.has(a.candidateId)) byStudent.set(a.candidateId, []);
    byStudent.get(a.candidateId)!.push(a);
  }
  const out: StudentRow[] = [];
  for (const [candidateId, items] of byStudent) {
    const detail: StudentRow["detail"] = {};
    const att: string[] = [];
    const cle: string[] = [];
    for (const c of Object.keys(COMPETENCIES) as CompetencyId[]) {
      const list = items
        .filter((a) => a.competency === c)
        .sort((x, y) => (x.attemptedOn < y.attemptedOn ? -1 : x.attemptedOn > y.attemptedOn ? 1 : 0));
      if (!list.length) continue;
      att.push(c);
      const idx = list.findIndex((a) => a.qualified);
      if (idx >= 0) cle.push(c);
      detail[c] = { attempts: list.length, firstClearOn: idx >= 0 ? list[idx].day : null, reattemptsToClear: idx >= 0 ? idx : null };
    }
    out.push({ candidateId, clearedAny: cle.length > 0, competenciesAttempted: att.join(";"), competenciesCleared: cle.join(";"), detail });
  }
  return out;
}

// ---------------------------------------------------------------- periods

export type PeriodRow = {
  grain: "month" | "week";
  period: string;
  periodStart: string;
  scope: string;
  attempted: number;
  cleared: number;
  clearancePct: number | null;
};

/**
 * The team's week: 7-day ranges inside each month (1-7, 8-14, 15-21, 22-28, 29-end).
 * Returns the bucket's first day (its key), last day, and a label like "Nov 1-7".
 */
export function weekBucket(day: string) {
  const ym = day.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const d = Number(day.slice(8, 10));
  const startDay = Math.min(Math.floor((d - 1) / 7) * 7 + 1, 29);
  const lastOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endDay = startDay === 29 ? lastOfMonth : startDay + 6;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { start: `${ym}-${pad(startDay)}`, end: `${ym}-${pad(endDay)}`, label: `${names[m - 1]} ${startDay}-${endDay}` };
}

/** Distinct students attempted / cleared per month and per 7-day range, for ALL and each competency with data. */
export function periodMatrix(attempts: Attempt[]): PeriodRow[] {
  const comps = [...new Set(attempts.map((a) => a.competency))].sort();
  const scopes: [string, CompetencyId | null][] = [["ALL", null], ...comps.map((c) => [c, c] as [string, CompetencyId])];
  const out: PeriodRow[] = [];
  for (const grain of ["month", "week"] as const) {
    for (const [scopeName, scopeComp] of scopes) {
      const att = new Map<string, { start: string; ids: Set<string> }>();
      const cle = new Map<string, Set<string>>();
      for (const a of attempts) {
        if (scopeComp && a.competency !== scopeComp) continue;
        let label: string;
        let start: string;
        if (grain === "month") {
          label = a.day.slice(0, 7);
          start = `${label}-01`;
        } else {
          const w = weekBucket(a.day);
          label = w.start; // period key for a week = its first day
          start = w.start;
        }
        if (!att.has(label)) att.set(label, { start, ids: new Set() });
        att.get(label)!.ids.add(a.candidateId);
        if (a.qualified) {
          if (!cle.has(label)) cle.set(label, new Set());
          cle.get(label)!.add(a.candidateId);
        }
      }
      for (const [label, { start, ids }] of [...att.entries()].sort((x, y) => (x[1].start < y[1].start ? -1 : 1))) {
        const c = cle.get(label)?.size ?? 0;
        out.push({ grain, period: label, periodStart: start, scope: scopeName, attempted: ids.size, cleared: c, clearancePct: pct(c, ids.size) });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- reconciliation

export function reconcile(m: Metrics) {
  const checks: { ok: boolean; text: string }[] = [];
  checks.push({ ok: m.clearedStudents <= m.attemptedStudents, text: `cleared (${m.clearedStudents}) <= attempted (${m.attemptedStudents})` });
  checks.push({
    ok: pct(m.clearedStudents, m.attemptedStudents) === m.clearancePct,
    text: `clearance % recomputed from counts matches reported ${m.clearancePct}%`,
  });
  for (const [c, r] of Object.entries(m.perCompetency)) {
    if (r.attempted || r.cleared) checks.push({ ok: r.cleared <= r.attempted, text: `${c}: cleared (${r.cleared}) <= attempted (${r.attempted})` });
  }
  checks.push({
    ok: m.attemptRows >= m.unevaluableAttemptRows,
    text: `attempt rows (${m.attemptRows}) = evaluable (${m.attemptRows - m.unevaluableAttemptRows}) + unevaluable (${m.unevaluableAttemptRows})`,
  });
  return checks;
}
