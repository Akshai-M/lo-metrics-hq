/**
 * One metrics run: fetch -> clean -> evaluate -> aggregate -> reconcile -> persist.
 * Everything is stored in the database: the source cache, the run and its audit files (ft_comp_run_files).
 */
import { ensureResults, fetchEvents, loadCachedResult } from "./appsScript";
import {
  aggregate,
  buildAttempts,
  cleanRows,
  competencyForDomain,
  periodMatrix,
  reconcile,
  studentTable,
  type AssessmentEvent,
  type CleanStats,
  type Metrics,
  type Row,
} from "./competency";
import { COMPETENCIES, type CompetencyId } from "./config";
import { cacheGet, persistRun, type EventRow } from "./store";
import { loadTr } from "./tr";


/** user_id -> YOG, from the database (loaded with `bun run yog "<file.csv>"`). */
async function loadYog(): Promise<Map<string, string>> {
  const saved = await cacheGet<Record<string, string>>("yog", "map");
  return new Map(Object.entries(saved ?? {}));
}

export type RunOptions = {
  refresh?: boolean;
  persist?: boolean;
  log?: (m: string) => void;
  deadline?: number; // epoch ms; past it the run stops with RunPaused and saves nothing
};

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

const pctText = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(2)}%`);

function summaryMarkdown(m: Metrics, checks: { ok: boolean; text: string }[], cov: Record<string, number>) {
  const lines = [
    "# FT Competency Assessment Metrics",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Competency Assessment Clearance % | ${pctText(m.clearancePct)} (${m.clearedStudents} / ${m.attemptedStudents}) |`,
    `| Assessment-cleared students | ${m.clearedStudents} |`,
    `| Attempted students | ${m.attemptedStudents} |`,
    `| Re-attempts to clear (avg / median) | ${m.reattempts.mean ?? "n/a"} / ${m.reattempts.median ?? "n/a"} (n=${m.reattempts.pairsCleared}) |`,
    `| Unevaluable attempt rows | ${m.unevaluableAttemptRows} |`,
    "",
    "| Competency | Attempted | Cleared | Clearance % |",
    "|---|---|---|---|",
    ...Object.entries(m.perCompetency)
      .filter(([, r]) => r.attempted > 0)
      .map(([c, r]) => `| ${c} ${r.name} | ${r.attempted} | ${r.cleared} | ${pctText(r.clearancePct)} |`),
    "",
    `Events: ${cov.events} in feed, ${cov.inScope} in scope, ${cov.read} read, ${cov.noLink} no link, ${cov.errors} errors, ${cov.outOfScope} out of scope.`,
    "",
    "## Reconciliation",
    ...checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"}: ${c.text}`),
    "",
  ];
  return lines.join("\n");
}

export async function runPipeline(opts: RunOptions = {}) {
  const log = opts.log ?? (() => {});
  const inScope = (e: AssessmentEvent) => competencyForDomain(e.domain) !== null;

  const events = await fetchEvents(log, opts.deadline);
  await ensureResults(events, inScope, { refresh: !!opts.refresh, deadline: opts.deadline }, log);

  const stats: CleanStats = { blankCandidateRowsDropped: 0, duplicateRowsDropped: 0 };
  const pairs: { event: AssessmentEvent; rows: Row[] | null }[] = [];
  const eventRows: EventRow[] = [];
  for (const e of events) {
    const cached = e.resultsLink && inScope(e) ? await loadCachedResult(e.resultsLink) : null;
    const rows = cached && "rows" in cached ? cleanRows(cached.rows, stats) : null;
    pairs.push({ event: e, rows });
    const comp = competencyForDomain(e.domain);
    const status: EventRow["status"] = !comp ? "Out of scope" : !e.resultsLink ? "No link" : rows ? "Read" : "Error";
    eventRows.push({
      event_idx: e.idx,
      competency: comp,
      domain: String(e.domain ?? "").trim(),
      mode: String(e.modeOfAssessment ?? "").trim(),
      assessment_no: e.assessmentNumber ? String(e.assessmentNumber) : null,
      results_link: e.resultsLink ?? null,
      status,
      tab_rule: cached && "rule" in cached ? cached.rule : null,
      subsheet_names: cached && "subsheetName" in cached ? cached.subsheetName : null,
      rows_read: rows ? rows.length : null,
      error: status === "Error" && cached && "error" in cached ? cached.error : null,
    });
  }

  const { attempts, gaps } = buildAttempts(pairs);
  const yogMap = await loadYog();
  for (const a of attempts) a.yog = yogMap.get(a.candidateId) ?? null;
  const yogCoverage = {
    studentsWithYog: new Set(attempts.filter((a) => a.yog).map((a) => a.candidateId)).size,
    studentsWithoutYog: new Set(attempts.filter((a) => !a.yog).map((a) => a.candidateId)).size,
  };
  const tr = await loadTr(log, opts.deadline);
  for (const t of tr.interviews) t.yog = yogMap.get(t.candidateId) ?? null;
  const trAttempted = tr.interviews.filter((t) => t.attempted);
  const trCoverage = {
    tabs: tr.tabs,
    interviews: tr.interviews.length,
    attemptedInterviews: trAttempted.length,
    clearedInterviews: trAttempted.filter((t) => t.cleared).length,
    clearedButNotAttempted: tr.interviews.filter((t) => t.cleared && !t.attempted).length,
    studentsWithoutYog: new Set(trAttempted.filter((t) => !t.yog).map((t) => t.candidateId)).size,
  };
  log(`TR: ${trCoverage.attemptedInterviews} attempted interviews, ${trCoverage.clearedInterviews} cleared`);
  const metrics = aggregate(attempts);
  const students = studentTable(attempts);
  const periods = periodMatrix(attempts);
  const checks = reconcile(metrics);

  const cov = {
    events: events.length,
    inScope: eventRows.filter((e) => e.competency).length,
    read: eventRows.filter((e) => e.status === "Read").length,
    noLink: eventRows.filter((e) => e.status === "No link").length,
    errors: eventRows.filter((e) => e.status === "Error").length,
    outOfScope: eventRows.filter((e) => e.status === "Out of scope").length,
  };
  const summaryMd = summaryMarkdown(metrics, checks, cov);
  const report = { gaps, checks, cleaning: stats, coverage: cov, yog: yogCoverage, tr: trCoverage, eventsInScope: cov.inScope, eventsRead: cov.read };

  // Audit files, stored with the run in the database (candidate_id only; no names or phone numbers).
  const files: Record<string, string> = {
    "summary.md": summaryMd,
    "run_report.json": JSON.stringify(report, null, 1),
    "attempts.csv": csv(
      attempts.map((a) => ({
        candidate_id: a.candidateId, competency: a.competency, event_idx: a.eventIdx, domain: a.domain, mode: a.mode,
        attempted_on: a.attemptedOn, ruleset: a.ruleset ?? "", qualified: a.qualified === null ? "" : a.qualified ? "Y" : "N",
        failed_sections: a.failed.join(";"), reason: a.reason, sheet_qualified: a.sheetQualified === null ? "" : a.sheetQualified ? "Y" : "N",
      }))
    ),
    "students.csv": csv(
      students.map((s) => {
        const row: Record<string, unknown> = {
          candidate_id: s.candidateId, cleared_any: s.clearedAny ? "Y" : "N",
          competencies_attempted: s.competenciesAttempted, competencies_cleared: s.competenciesCleared,
        };
        for (const c of Object.keys(COMPETENCIES) as CompetencyId[]) {
          const d = s.detail[c];
          row[`${c}_attempts`] = d?.attempts ?? 0;
          row[`${c}_first_clear_on`] = d?.firstClearOn ?? "";
          row[`${c}_reattempts_to_clear`] = d?.reattemptsToClear ?? "";
        }
        return row;
      })
    ),
    "periodic_matrix.csv": csv(periods as unknown as Record<string, unknown>[]),
    "tr_interviews.csv": csv(
      tr.interviews.map((t) => ({
        candidate_id: t.candidateId, competency: t.competency, tab: t.tab, interview_on: t.day, status: t.status,
        attempted: t.attempted ? "Y" : "N", cleared: t.cleared ? "Y" : "N", level: t.level ?? "", verdict: t.verdict ?? "",
      }))
    ),
    "events.csv": csv(eventRows as unknown as Record<string, unknown>[]),
  };

  let runId: string | null = null;
  if (opts.persist !== false) runId = await persistRun({ metrics, events: eventRows, attempts, periods, students, tr: tr.interviews, summaryMd, report, files });

  return { runId, metrics, checks, coverage: cov, cleaning: stats, summaryMd };
}
