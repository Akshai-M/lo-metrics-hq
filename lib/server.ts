/**
 * Elysia API, mounted inside Next.js at app/api/[[...slugs]]/route.ts.
 *
 *   GET  /api/health
 *   GET  /api/metrics/latest            headline + by-competency + coverage for the latest run
 *   GET  /api/periods?grain=&scope=     weekly / monthly matrix (grain: month|week, scope: ALL|C1..C7)
 *   GET  /api/splits?grain=             period split (month | week), overall split, YOG split (online / offline)
 *   GET  /api/runs                      run history
 *   POST /api/refresh                   start a metrics run in the background ({ refresh?, refreshErrors? })
 *   GET  /api/refresh/status            state of the current / last run
 *
 * If REFRESH_TOKEN is set in .env, POST /api/refresh requires header x-refresh-token.
 */
import { Elysia, t } from "elysia";
import { runPipeline } from "./metrics/pipeline";
import { competencyBreakdown, eventIssues, eventStatus, latestRun, periods, runAttempts, runHistory } from "./metrics/store";
import { overallSplit, periodSplit, yogSplit } from "./metrics/splits";
import { COMPETENCIES } from "./metrics/config";

type JobState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastRunId: string | null;
  lastError: string | null;
  log: string[];
};
const job: JobState = { running: false, startedAt: null, finishedAt: null, lastRunId: null, lastError: null, log: [] };

function startRun(opts: { refresh?: boolean; refreshErrors?: boolean }) {
  job.running = true;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.lastError = null;
  job.log = [];
  runPipeline({ ...opts, log: (m) => job.log.push(m) })
    .then((r) => {
      job.lastRunId = r.runId;
      job.log.push(`Saved run ${r.runId}: ${r.metrics.clearancePct}% (${r.metrics.clearedStudents} / ${r.metrics.attemptedStudents})`);
    })
    .catch((err) => {
      job.lastError = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    });
}

const scopes = ["ALL", ...Object.keys(COMPETENCIES)];

export const api = new Elysia({ prefix: "/api" })
  .get("/health", () => ({ ok: true }))
  .get("/metrics/latest", async ({ status }) => {
    const run = await latestRun();
    if (!run) return status(404, { error: "No metrics run yet. POST /api/refresh to load data." });
    const [competencies, statuses, issues] = await Promise.all([
      competencyBreakdown(run.runId),
      eventStatus(run.runId),
      eventIssues(run.runId),
    ]);
    return { run, competencies, eventStatus: statuses, issues };
  })
  .get(
    "/periods",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const grain = query.grain ?? "month";
      const scope = scopes.includes(query.scope ?? "ALL") ? (query.scope ?? "ALL") : "ALL";
      return { runId: run.runId, grain, scope, rows: await periods(run.runId, grain, scope) };
    },
    {
      query: t.Object({
        grain: t.Optional(t.Union([t.Literal("month"), t.Literal("week")])),
        scope: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/splits",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const attempts = await runAttempts(run.runId);
      return {
        runId: run.runId,
        period: periodSplit(attempts, query.grain ?? "month"),
        overall: overallSplit(attempts),
        yog: yogSplit(attempts),
      };
    },
    { query: t.Object({ grain: t.Optional(t.Union([t.Literal("month"), t.Literal("week")])) }) }
  )
  .get("/runs", () => runHistory())
  .post(
    "/refresh",
    ({ body, headers, status }) => {
      const token = process.env.REFRESH_TOKEN;
      if (token && headers["x-refresh-token"] !== token) return status(401, { error: "Invalid refresh token" });
      if (job.running) return status(409, { error: "A run is already in progress", startedAt: job.startedAt });
      startRun({ refresh: body?.refresh, refreshErrors: body?.refreshErrors });
      return status(202, { started: true, startedAt: job.startedAt });
    },
    {
      body: t.Optional(t.Object({ refresh: t.Optional(t.Boolean()), refreshErrors: t.Optional(t.Boolean()) })),
    }
  )
  .get("/refresh/status", () => ({ ...job, log: job.log.slice(-50) }));
