/**
 * Postgres persistence (DATABASE_URL) via postgres.js.
 *
 * Tables (ft_comp_ = FT competency phase), one set of rows per run_id:
 *   ft_comp_runs      headline metrics, summary, report (jsonb)
 *   ft_comp_events    one row per event: link, tab rule, tabs read, status
 *   ft_comp_attempts  one row per ATTEMPTED result row (candidate_id only, no names)
 *   ft_comp_periods   weekly / monthly attempted, cleared, clearance %
 *   ft_comp_students  one row per student with per-competency detail (jsonb)
 *   ft_comp_tr        one row per TR interview (candidate_id only)
 *
 * Placements are separate from runs (loaded with `bun run placements`), so an assessment refresh
 * never touches them; the dashboard reads the latest import:
 *   ft_placement_imports  one row per import (when, source file name, record count)
 *   ft_placements         one row per placement record (candidate_id, dates, status, type only)
 */
import postgres from "postgres";
import type { Attempt, Metrics, PeriodRow, StudentRow } from "./competency";
import type { TrInterview } from "./tr";
import type { Placement } from "./placements";

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
CREATE TABLE IF NOT EXISTS ft_comp_jobs (
  job_id uuid PRIMARY KEY,
  kind text NOT NULL,            -- incremental | full
  trigger text NOT NULL,         -- dashboard | api
  status text NOT NULL,          -- running | succeeded | failed
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  run_id uuid,
  error text,
  log jsonb NOT NULL DEFAULT '[]'::jsonb
);
-- Copies of what the sheets returned, minus personal fields (kind: events | result | tr | yog).
CREATE TABLE IF NOT EXISTS ft_comp_source_cache (
  kind text NOT NULL,
  key text NOT NULL,
  fetched_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (kind, key)
);
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
-- The audit files of a run (CSV / summary / report), as text. Candidate IDs only, no names or phone numbers.
CREATE TABLE IF NOT EXISTS ft_comp_run_files (
  run_id uuid NOT NULL REFERENCES ft_comp_runs(run_id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  PRIMARY KEY (run_id, name)
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
);
CREATE TABLE IF NOT EXISTS ft_comp_tr (
  run_id uuid NOT NULL REFERENCES ft_comp_runs(run_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  competency text NOT NULL, tab text, interview_on date, status text,
  attempted boolean, cleared boolean, level text, yog text
);
CREATE INDEX IF NOT EXISTS ft_comp_tr_run ON ft_comp_tr (run_id);
ALTER TABLE ft_comp_tr ADD COLUMN IF NOT EXISTS verdict text;
CREATE TABLE IF NOT EXISTS ft_placement_imports (
  import_id uuid PRIMARY KEY,
  imported_at timestamptz NOT NULL,
  source text,
  records int
);
CREATE TABLE IF NOT EXISTS ft_placements (
  import_id uuid NOT NULL REFERENCES ft_placement_imports(import_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  entry_on date, status text, latest_status text, placed_through text, placement_type text, company_type text
);
CREATE INDEX IF NOT EXISTS ft_placements_import ON ft_placements (import_id);`;

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
  tr: TrInterview[];
  summaryMd: string;
  report: Record<string, unknown>;
  files: Record<string, string>; // audit files by name (attempts.csv, students.csv, ...)
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
      "ft_comp_run_files",
      Object.entries(input.files).map(([name, content]) => ({ run_id: runId, name, content })),
      4
    );
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
    await insertChunked(
      tx,
      "ft_comp_tr",
      input.tr.map((t) => ({
        run_id: runId,
        candidate_id: t.candidateId,
        competency: t.competency,
        tab: t.tab,
        interview_on: t.day,
        status: t.status,
        attempted: t.attempted,
        cleared: t.cleared,
        level: t.level,
        verdict: t.verdict,
        yog: t.yog ?? null,
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
    SELECT event_idx, competency, domain, mode, assessment_no, status, error, results_link FROM ft_comp_events
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
    SELECT candidate_id, competency, mode, to_char(attempted_on, 'YYYY-MM-DD') AS day,
           to_char(attempted_on, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS stamp, qualified, yog, failed_sections
      FROM ft_comp_attempts WHERE run_id = ${runId}`;
  return (rows as Record<string, unknown>[]).map((r) => ({
    candidateId: r.candidate_id as string,
    competency: r.competency as string,
    mode: r.mode as string,
    day: r.day as string,
    stamp: r.stamp as string,
    qualified: r.qualified as boolean | null,
    yog: (r.yog as string | null) ?? null,
    // Stored as gated section keys joined with ";" (see evaluateAttempt).
    failed: ((r.failed_sections as string | null) ?? "").split(";").filter(Boolean),
  }));
}

/** TR interviews of a run (attempted ones only), for the splits. */
export async function runTr(runId: string) {
  const rows = await db()`
    SELECT candidate_id, competency, to_char(interview_on, 'YYYY-MM-DD') AS day, cleared, level, verdict, yog
      FROM ft_comp_tr WHERE run_id = ${runId} AND attempted`;
  return rows.map((r) => ({
    candidateId: r.candidate_id as string,
    competency: r.competency as string,
    day: r.day as string,
    cleared: r.cleared as boolean,
    level: (r.level as string | null) ?? null,
    verdict: (r.verdict as string | null) ?? null,
    yog: (r.yog as string | null) ?? null,
  }));
}

/** Replaces the placement data with a new import (kept apart from metrics runs). */
export async function importPlacements(rows: Placement[], source: string) {
  const sql = db();
  await sql.unsafe(SCHEMA);
  const importId = crypto.randomUUID();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO ft_placement_imports ${tx({ import_id: importId, imported_at: new Date(), source, records: rows.length })}`;
    await insertChunked(
      tx,
      "ft_placements",
      rows.map((p) => ({
        import_id: importId,
        candidate_id: p.candidateId,
        entry_on: p.day,
        status: p.status,
        latest_status: p.latestStatus,
        placed_through: p.placedThrough,
        placement_type: p.placementType,
        company_type: p.companyType,
      }))
    );
    // Only the latest import is used; older ones are removed.
    await tx`DELETE FROM ft_placement_imports WHERE import_id <> ${importId}`;
  });
  return importId;
}

/** The latest placement import: when, from which file, and its records (empty if never imported). */
export async function latestPlacements() {
  const sql = db();
  const [imp] = await sql`
    SELECT import_id, imported_at, source, records FROM ft_placement_imports ORDER BY imported_at DESC LIMIT 1`.catch(() => []);
  if (!imp) return { importedAt: null as string | null, source: null as string | null, rows: [] as Placement[] };
  const rows = await sql`
    SELECT candidate_id, to_char(entry_on, 'YYYY-MM-DD') AS day, status, latest_status, placed_through, placement_type, company_type
      FROM ft_placements WHERE import_id = ${imp.import_id}`;
  return {
    importedAt: new Date(imp.imported_at as string).toISOString(),
    source: imp.source as string | null,
    rows: rows.map((r) => ({
      candidateId: r.candidate_id as string,
      day: r.day as string | null,
      status: r.status as string,
      latestStatus: r.latest_status as string,
      placedThrough: r.placed_through as string,
      placementType: r.placement_type as string,
      companyType: r.company_type as string,
    })),
  };
}

/** When the latest placement import ran, from which file, and how many records. */
export async function placementImportInfo() {
  const [imp] = await db()`
    SELECT imported_at, source, records FROM ft_placement_imports ORDER BY imported_at DESC LIMIT 1`.catch(() => []);
  return imp ? { importedAt: new Date(imp.imported_at as string).toISOString(), source: imp.source as string | null, records: imp.records as number } : null;
}

// ---------------------------------------------------------------- source cache + run jobs

let schemaReady: Promise<void> | null = null;
/** Creates the tables once per process (safe to call from any path). */
export function ensureSchema() {
  schemaReady ??= db()
    .unsafe(SCHEMA)
    .then(() => undefined)
    .catch((err) => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

export async function cacheGet<T>(kind: string, key: string): Promise<T | null> {
  await ensureSchema();
  const rows = await db()`SELECT payload FROM ft_comp_source_cache WHERE kind = ${kind} AND key = ${key}`;
  return rows.length ? (rows[0].payload as T) : null;
}

export async function cacheGetAll<T>(kind: string): Promise<Map<string, T>> {
  await ensureSchema();
  const rows = await db()`SELECT key, payload FROM ft_comp_source_cache WHERE kind = ${kind}`;
  return new Map(rows.map((r) => [r.key as string, r.payload as T]));
}

export async function cachePut(kind: string, key: string, payload: unknown) {
  await ensureSchema();
  const json = db().json(payload as postgres.JSONValue);
  await db()`
    INSERT INTO ft_comp_source_cache (kind, key, fetched_at, payload) VALUES (${kind}, ${key}, now(), ${json})
    ON CONFLICT (kind, key) DO UPDATE SET fetched_at = now(), payload = EXCLUDED.payload`;
}

export type JobRow = {
  jobId: string;
  kind: string;
  trigger: string;
  status: string; // running | succeeded | partial (paused at the time limit) | failed
  startedAt: string;
  finishedAt: string | null;
  runId: string | null;
  error: string | null;
  log: string[];
};

/** A run still "running" after this long was killed (serverless timeout); it counts as failed. */
const JOB_STALE_MINUTES = 6; // a hosted run is cut off at 300 s, so 6 minutes means it was killed

/** Starts a job unless one is already running. Returns false when another run is in progress. */
export async function startJob(jobId: string, kind: string, trigger: string): Promise<boolean> {
  await ensureSchema();
  await db()`
    UPDATE ft_comp_jobs SET status = 'failed', error = 'Run did not finish (timed out)', finished_at = now()
     WHERE status = 'running' AND started_at < now() - make_interval(mins => ${JOB_STALE_MINUTES})`;
  const busy = await db()`SELECT 1 FROM ft_comp_jobs WHERE status = 'running' LIMIT 1`;
  if (busy.length) return false;
  await db()`INSERT INTO ft_comp_jobs (job_id, kind, trigger, status, started_at) VALUES (${jobId}, ${kind}, ${trigger}, 'running', now())`;
  return true;
}

export async function updateJobLog(jobId: string, log: string[]) {
  const json = db().json(log);
  await db()`UPDATE ft_comp_jobs SET log = ${json} WHERE job_id = ${jobId}`;
}

export async function finishJob(jobId: string, status: "succeeded" | "partial" | "failed", runId: string | null, error: string | null, log: string[]) {
  const json = db().json(log);
  await db()`
    UPDATE ft_comp_jobs SET status = ${status}, finished_at = now(), run_id = ${runId}, error = ${error}, log = ${json}
     WHERE job_id = ${jobId}`;
}

/** The most recent job (any status). */
export async function latestJob(): Promise<JobRow | null> {
  await ensureSchema();
  const rows = await db()`
    SELECT job_id, kind, trigger, status, started_at, finished_at, run_id, error, log
      FROM ft_comp_jobs ORDER BY started_at DESC LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  const startedAt = new Date(r.started_at as string | Date);
  const stale = r.status === "running" && Date.now() - startedAt.getTime() > JOB_STALE_MINUTES * 60_000;
  return {
    jobId: r.job_id as string,
    kind: r.kind as string,
    trigger: r.trigger as string,
    status: stale ? "failed" : (r.status as string),
    startedAt: startedAt.toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at as string | Date).toISOString() : null,
    runId: (r.run_id as string | null) ?? null,
    error: stale ? "Run did not finish (timed out)" : ((r.error as string | null) ?? null),
    log: (r.log as string[]) ?? [],
  };
}
