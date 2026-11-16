/**
 * One metrics run: fetch -> clean -> evaluate -> aggregate -> reconcile -> persist.
 * Also writes audit files to output/ (CSV + summary + report).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
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
import { persistRun, type EventRow } from "./store";

const OUT_DIR = join(process.cwd(), "output");
const YOG_FILE = join(process.cwd(), "data", "user_yog.csv"); // export with columns user_id,YOG

/** user_id -> YOG from data/user_yog.csv (empty map if the file is missing). */
async function loadYog(): Promise<Map<string, string>> {
  const f = Bun.file(YOG_FILE);
  if (!(await f.exists())) return new Map();
  const lines = (await f.text()).trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idCol = header.indexOf("user_id");
  const yogCol = header.indexOf("yog");
  const map = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const id = (cells[idCol] ?? "").trim();
    const yog = (cells[yogCol] ?? "").trim();
    if (id && yog) map.set(id, yog);
  }
  return map;
}

export type RunOptions = { refresh?: boolean; refreshErrors?: boolean; persist?: boolean; log?: (m: string) => void };

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

  const events = await fetchEvents(!!opts.refresh);
  await ensureResults(events, inScope, { refresh: !!opts.refresh, refreshErrors: !!opts.refreshErrors }, log);

  const stats: CleanStats = { blankCandidateRowsDropped: 0, duplicateRowsDropped: 0 };
  const pairs: { event: AssessmentEvent; rows: Row[] | null }[] = [];
  const eventRows: EventRow[] = [];
  for (const e of events) {
    const cached = e.resultsLink && inScope(e) ? await loadCachedResult(e.idx) : null;
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
  const report = { gaps, checks, cleaning: stats, coverage: cov, yog: yogCoverage, eventsInScope: cov.inScope, eventsRead: cov.read };

  // Audit files (candidate_id only; no names or phone numbers)
  await mkdir(OUT_DIR, { recursive: true });
  await Bun.write(join(OUT_DIR, "summary.md"), summaryMd);
  await Bun.write(join(OUT_DIR, "run_report.json"), JSON.stringify(report, null, 1));
  await Bun.write(
    join(OUT_DIR, "attempts.csv"),
    csv(attempts.map((a) => ({
      candidate_id: a.candidateId, competency: a.competency, event_idx: a.eventIdx, domain: a.domain, mode: a.mode,
      attempted_on: a.attemptedOn, ruleset: a.ruleset ?? "", qualified: a.qualified === null ? "" : a.qualified ? "Y" : "N",
      failed_sections: a.failed.join(";"), reason: a.reason, sheet_qualified: a.sheetQualified === null ? "" : a.sheetQualified ? "Y" : "N",
    })))
  );
  await Bun.write(
    join(OUT_DIR, "students.csv"),
    csv(students.map((s) => {
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
    }))
  );
  await Bun.write(join(OUT_DIR, "periodic_matrix.csv"), csv(periods as unknown as Record<string, unknown>[]));
  await Bun.write(join(OUT_DIR, "events.csv"), csv(eventRows as unknown as Record<string, unknown>[]));

  let runId: string | null = null;
  if (opts.persist !== false) runId = await persistRun({ metrics, events: eventRows, attempts, periods, students, summaryMd, report });

  return { runId, metrics, checks, coverage: cov, cleaning: stats, summaryMd };
}
