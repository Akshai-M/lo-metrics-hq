/**
 * Postgres persistence (DATABASE_URL) via postgres.js.
 *
 * Tables (ft_comp_ = FT competency phase), one set of rows per run_id:
 *   ft_comp_runs      headline metrics, summary, report (jsonb)
 *   ft_comp_events    one row per event: link, tab rule, tabs read, status
 *   ft_comp_attempts  one row per ATTEMPTED result row (candidate_id only, no names)
 *   ft_comp_periods   weekly / monthly attempted, cleared, clearance %
 *   ft_comp_students  one row per student with per-competency detail (jsonb)
 */
import postgres from "postgres";
import type { Attempt, Metrics, PeriodRow, StudentRow } from "./competency";

// postgres.js: works on Node (Vercel) and Bun. Serverless gets a single connection per instance.
type Sql = postgres.Sql;
let client: Sql | null = null;
export function db(): Sql {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set in .env");
    client = postgres(process.env.DATABASE_URL, { max: process.env.VERCEL ? 1 : 10, onnotice: () => {} });
  }
  return client;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ft_comp_runs (
  run_id uuid PRIMARY KEY,
  run_at timestamptz NOT NULL,
  attempted_students int,
  cleared_students int,
  clearance_pct numeric(6,2),
  reattempt_mean numeric(8,3),
  reattempt_median numeric(8,3),
  unevaluable_attempt_rows int,
  events_in_scope int,
  events_read int,
  summary_md text,
  report jsonb
);
CREATE TABLE IF NOT EXISTS ft_comp_events (
  run_id uuid NOT NULL REFERENCES ft_comp_runs(run_id) ON DELETE CASCADE,
  event_idx int NOT NULL,
  competency text, domain text, mode text, assessment_no text, results_link text,
  status text, tab_rule text, subsheet_names text, rows_read int, error text,
  PRIMARY KEY (run_id, event_idx)
);
CREATE TABLE IF NOT EXISTS ft_comp_attempts (
  run_id uuid NOT NULL REFERENCES ft_comp_runs(run_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  competency text, event_idx int, domain text, mode text,
  attempted_on timestamp, ruleset text, qualified boolean,
  failed_sections text, reason text, sheet_qualified boolean
);
ALTER TABLE ft_comp_attempts ADD COLUMN IF NOT EXISTS yog text;
CREATE INDEX IF NOT EXISTS ft_comp_attempts_run ON ft_comp_attempts (run_id);
CREATE TABLE IF NOT EXISTS ft_comp_periods (
  run_id uuid NOT NULL REFERENCES ft_comp_runs(run_id) ON DELETE CASCADE,
  grain text NOT NULL, period text NOT NULL, period_start date, scope text NOT NULL,
  attempted int, cleared int, clearance_pct numeric(6,2),
  PRIMARY KEY (run_id, grain, period, scope)
);
CREATE TABLE IF NOT EXISTS ft_comp_students (
  run_id uuid NOT NULL REFERENCES ft_comp_runs(run_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  cleared_any boolean, competencies_attempted text, competencies_cleared text, detail jsonb,
  PRIMARY KEY (run_id, candidate_id)
);`;

export type EventRow = {
  event_idx: number;
  competency: string | null;
  domain: string;
  mode: string;
  assessment_no: string | null;
  results_link: string | null;
  status: "Read" | "No link" | "Error" | "Out of scope";
  tab_rule: string | null;
  subsheet_names: string | null;
  rows_read: number | null;
  error: string | null;
};

async function insertChunked(sql: Sql | postgres.TransactionSql, table: string, rows: Record<string, unknown>[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    await sql`INSERT INTO ${sql(table)} ${sql(rows.slice(i, i + size))}`;
  }
}

export async function persistRun(input: {
  metrics: Metrics;
  events: EventRow[];
  attempts: Attempt[];
  periods: PeriodRow[];
  students: StudentRow[];
  summaryMd: string;
  report: Record<string, unknown>;
}): Promise<string> {
  const sql = db();
  const runId = crypto.randomUUID();
  const { metrics: m } = input;
  await sql.unsafe(SCHEMA);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO ft_comp_runs ${tx({
      run_id: runId,
      run_at: new Date(),
      attempted_students: m.attemptedStudents,
      cleared_students: m.clearedStudents,
      clearance_pct: m.clearancePct,
      reattempt_mean: m.reattempts.mean,
      reattempt_median: m.reattempts.median,
      unevaluable_attempt_rows: m.unevaluableAttemptRows,
      events_in_scope: input.report.eventsInScope as number,
      events_read: input.report.eventsRead as number,
      summary_md: input.summaryMd,
      report: input.report,
    })}`;
    await insertChunked(tx, "ft_comp_events", input.events.map((e) => ({ run_id: runId, ...e })));
    await insertChunked(
      tx,
      "ft_comp_attempts",
      input.attempts.map((a) => ({
        run_id: runId,
        candidate_id: a.candidateId,
        competency: a.competency,
        event_idx: a.eventIdx,
        domain: a.domain,
        mode: a.mode,
        attempted_on: a.attemptedOn,
        ruleset: a.ruleset,
        qualified: a.qualified,
        failed_sections: a.failed.join(";"),
        reason: a.reason,
        sheet_qualified: a.sheetQualified,
        yog: a.yog ?? null,
      }))
    );
    await insertChunked(
      tx,
      "ft_comp_periods",
      input.periods.map((p) => ({
        run_id: runId,
        grain: p.grain,
        period: p.period,
        period_start: p.periodStart,
        scope: p.scope,
        attempted: p.attempted,
        cleared: p.cleared,
        clearance_pct: p.clearancePct,
      }))
    );
    await insertChunked(
      tx,
      "ft_comp_students",
      input.students.map((s) => ({
        run_id: runId,
        candidate_id: s.candidateId,
        cleared_any: s.clearedAny,
        competencies_attempted: s.competenciesAttempted,
        competencies_cleared: s.competenciesCleared,
        detail: s.detail,
      }))
    );
  });
  return runId;
}

// ---------------------------------------------------------------- reads (for the API)

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function latestRun() {
  const [r] = await db()`
    SELECT run_id, run_at, attempted_students, cleared_students, clearance_pct, reattempt_mean,
           reattempt_median, unevaluable_attempt_rows, events_in_scope, events_read
      FROM ft_comp_runs ORDER BY run_at DESC LIMIT 1`;
  if (!r) return null;
  return {
    runId: r.run_id as string,
    runAt: new Date(r.run_at).toISOString(),
    attemptedStudents: r.attempted_students as number,
    clearedStudents: r.cleared_students as number,
    clearancePct: num(r.clearance_pct),
    reattemptMean: num(r.reattempt_mean),
    reattemptMedian: num(r.reattempt_median),
    unevaluableAttemptRows: r.unevaluable_attempt_rows as number,
    eventsInScope: r.events_in_scope as number,
    eventsRead: r.events_read as number,
  };
}

export async function competencyBreakdown(runId: string) {
  return db()`
    SELECT competency,
           COUNT(DISTINCT candidate_id)::int AS attempted,
           (COUNT(DISTINCT candidate_id) FILTER (WHERE qualified))::int AS cleared,
           (COUNT(*) FILTER (WHERE qualified IS NULL))::int AS unevaluable
      FROM ft_comp_attempts WHERE run_id = ${runId}
     GROUP BY competency ORDER BY competency` as Promise<{ competency: string; attempted: number; cleared: number; unevaluable: number }[]>;
}

export async function periods(runId: string, grain: "month" | "week", scope: string) {
  const rows = await db()`
    SELECT grain, period, to_char(period_start, 'YYYY-MM-DD') AS period_start, scope, attempted, cleared, clearance_pct
      FROM ft_comp_periods WHERE run_id = ${runId} AND grain = ${grain} AND scope = ${scope}
     ORDER BY period_start`;
  return (rows as Record<string, unknown>[]).map((r) => ({
    grain: r.grain,
    period: r.period,
    periodStart: r.period_start,
    scope: r.scope,
    attempted: r.attempted,
    cleared: r.cleared,
    clearancePct: num(r.clearance_pct),
  }));
}

export async function eventStatus(runId: string) {
  return db()`
    SELECT status, COUNT(*)::int AS count FROM ft_comp_events
     WHERE run_id = ${runId} GROUP BY status ORDER BY status` as Promise<{ status: string; count: number }[]>;
}

export async function eventIssues(runId: string) {
  return db()`
    SELECT event_idx, competency, domain, mode, assessment_no, status, error FROM ft_comp_events
     WHERE run_id = ${runId} AND status IN ('Error', 'No link') ORDER BY event_idx`;
}

export async function runHistory(limit = 20) {
  const rows = await db()`
    SELECT run_id, run_at, attempted_students, cleared_students, clearance_pct
      FROM ft_comp_runs ORDER BY run_at DESC LIMIT ${limit}`;
  return (rows as Record<string, unknown>[]).map((r) => ({
    runId: r.run_id,
    runAt: new Date(r.run_at as string | Date).toISOString(),
    attemptedStudents: r.attempted_students,
    clearedStudents: r.cleared_students,
    clearancePct: num(r.clearance_pct),
  }));
}

/** Attempt rows of a run, in the shape the report splits need. */
export async function runAttempts(runId: string) {
  const rows = await db()`
    SELECT candidate_id, competency, mode, to_char(attempted_on, 'YYYY-MM-DD') AS day, qualified, yog
      FROM ft_comp_attempts WHERE run_id = ${runId}`;
  return (rows as Record<string, unknown>[]).map((r) => ({
    candidateId: r.candidate_id as string,
    competency: r.competency as string,
    mode: r.mode as string,
    day: r.day as string,
    qualified: r.qualified as boolean | null,
    yog: (r.yog as string | null) ?? null,
  }));
}
