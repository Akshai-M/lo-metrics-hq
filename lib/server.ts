/**
 * Elysia API, mounted inside Next.js at app/api/[[...slugs]]/route.ts.
 *
 *   GET  /api/health
 *   GET  /api/metrics/latest            headline + by-competency + coverage for the latest run
 *   GET  /api/periods?grain=&scope=     weekly / monthly matrix (grain: month|week, scope: ALL|C1..C7)
 *   GET  /api/overview?grain=&<filters>  headline, trend and per-competency numbers for the global filters
 *   GET  /api/splits?grain=&<filters>    period split (month | week), overall split, YOG split, TR levels
 *   GET  /api/reattempts?rcomp=&<filters> attempts-to-clear and duration views (rcomp: one competency, default all selected)
 *   GET  /api/failures?<filters>        failed gated sections per competency and mode
 *   GET  /api/students?<filters>        one row per student
 *   GET  /api/outcomes?<filters>        assessed pool -> placed, placement mix, TR -> cleared, verdict bands
 *        <filters>: comps, yogs, modes, online, from, to, attempt, unev, active (see lib/metrics/filters.ts)
 *   GET  /api/runs                      run history
 *   POST /api/refresh                   start a metrics run in the background ({ refresh?, refreshErrors? })
 *   GET  /api/refresh/status            state of the current / last run
 *   POST /api/auth/login                { username, password } -> session cookie
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *
 * Every route except /api/health and /api/auth/login needs a signed-in session.
 * POST /api/refresh also accepts header x-refresh-token (REFRESH_TOKEN in .env) for scripts.
 */
import { Elysia, t } from "elysia";
import { runPipeline } from "./metrics/pipeline";
import { competencyBreakdown, eventIssues, eventStatus, latestRun, periods, runHistory } from "./metrics/store";
import { overallSplit, periodSplit, trLevelSplit, yogSplit } from "./metrics/splits";
import { overview, stages } from "./metrics/overview";
import { applyFilters, loadRows, pick } from "./metrics/filters";
import { failureReasons, reattemptViews } from "./metrics/reattempts";
import { studentRows } from "./metrics/students";
import { placementViews, trViews } from "./metrics/outcomes";
import { runPlacements } from "./metrics/store";
import { COMPETENCIES, TR_COUNT } from "./metrics/config";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  checkLogin,
  clearLoginFailures,
  createSessionToken,
  loginLocked,
  recordLoginFailure,
  sessionUser,
} from "./auth";

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


const filterQuery = t.Object({
  grain: t.Optional(t.Union([t.Literal("month"), t.Literal("week")])),
  comps: t.Optional(t.String()),
  yogs: t.Optional(t.String()),
  modes: t.Optional(t.String()),
  online: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  attempt: t.Optional(t.String()),
  unev: t.Optional(t.String()),
  active: t.Optional(t.String()),
  rcomp: t.Optional(t.String()),
  pcomps: t.Optional(t.String()), // period chart: competencies to combine (default all selected)
});

const PUBLIC = new Set(["/api/health", "/api/auth/login"]);
const tokenOf = (cookie: Record<string, { value?: unknown }>) => {
  const v = cookie[SESSION_COOKIE]?.value;
  return typeof v === "string" && v ? v : undefined;
};

export const api = new Elysia({ prefix: "/api" })
  .derive(({ cookie }) => ({ user: sessionUser(tokenOf(cookie)) }))
  .onBeforeHandle(({ user, path, request, status }) => {
    if (user || PUBLIC.has(path)) return;
    const token = process.env.REFRESH_TOKEN;
    if (path === "/api/refresh" && token && request.headers.get("x-refresh-token") === token) return;
    return status(401, { error: "Not signed in" });
  })
  .get("/health", () => ({ ok: true }))
  .post(
    "/auth/login",
    ({ body, cookie, status }) => {
      if (loginLocked()) return status(429, { error: "Too many failed attempts. Try again in 15 minutes." });
      if (!checkLogin(body.username.trim(), body.password)) {
        recordLoginFailure();
        return status(401, { error: "Wrong username or password" });
      }
      clearLoginFailures();
      const token = createSessionToken();
      cookie[SESSION_COOKIE].set({
        value: token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_DAYS * 86_400,
      });
      return { ok: true };
    },
    { body: t.Object({ username: t.String({ maxLength: 100 }), password: t.String({ maxLength: 200 }) }) }
  )
  .post("/auth/logout", ({ cookie }) => {
    cookie[SESSION_COOKIE].remove();
    return { ok: true };
  })
  .get("/auth/me", ({ user }) => ({ username: user!.username }))
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
    "/overview",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const { filters, options, rows, unevaluableRows } = applyFilters(await loadRows(run.runId), query);
      return {
        runId: run.runId,
        options,
        filters,
        ...overview(rows, unevaluableRows, filters.comps, query.grain ?? "month"),
        ...stages(rows, filters.comps, filters.modes),
      };
    },
    { query: filterQuery }
  )
  .get(
    "/splits",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const { filters, rows } = applyFilters(await loadRows(run.runId), query);
      const { comps, modes } = filters;
      // TR counted per student (same as online / offline) or per interview, see TR_COUNT in config.
      const attempts = rows.map((r, i) => ({
        ...r,
        candidateId: r.mode === "TR" && TR_COUNT === "interviews" ? `${r.candidateId}#${i}` : r.candidateId,
      }));
      const tr = attempts.filter((r) => r.mode === "TR").map((r) => ({ ...r, cleared: !!r.qualified }));
      return {
        runId: run.runId,
        trCount: TR_COUNT,
        modes,
        period: periodSplit(attempts, query.grain ?? "month", comps, modes, pick(query.pcomps, comps)),
        overall: { ...overallSplit(attempts, comps, modes), trLevels: modes.includes("TR") ? trLevelSplit(tr, comps) : [] },
        yog: yogSplit(attempts, comps, modes),
      };
    },
    { query: filterQuery }
  )
  .get(
    "/reattempts",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const { filters, rows } = applyFilters(await loadRows(run.runId), query);
      const comp = query.rcomp && filters.comps.includes(query.rcomp) ? query.rcomp : null;
      return { runId: run.runId, ...reattemptViews(rows, comp) };
    },
    { query: filterQuery }
  )
  .get(
    "/failures",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const { filters, rows } = applyFilters(await loadRows(run.runId), query);
      return { runId: run.runId, competencies: failureReasons(rows, filters.comps, filters.modes) };
    },
    { query: filterQuery }
  )
  .get(
    "/students",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const { rows, isActive } = applyFilters(await loadRows(run.runId), query);
      return { runId: run.runId, students: studentRows(rows, isActive) };
    },
    { query: filterQuery }
  )
  .get(
    "/outcomes",
    async ({ query, status }) => {
      const run = await latestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const [all, placements] = await Promise.all([loadRows(run.runId), runPlacements(run.runId)]);
      const { filters, rows } = applyFilters(all, query);
      return {
        runId: run.runId,
        placement: placementViews(rows, all, placements, filters.comps),
        tr: trViews(rows, filters.comps),
      };
    },
    { query: filterQuery }
  )
  .get("/runs", () => runHistory())
  .post(
    "/refresh",
    ({ body, status }) => {
      if (job.running) return status(409, { error: "A run is already in progress", startedAt: job.startedAt });
      startRun({ refresh: body?.refresh, refreshErrors: body?.refreshErrors });
      return status(202, { started: true, startedAt: job.startedAt });
    },
    {
      body: t.Optional(t.Object({ refresh: t.Optional(t.Boolean()), refreshErrors: t.Optional(t.Boolean()) })),
    }
  )
  .get("/refresh/status", () => ({ ...job, log: job.log.slice(-50) }));
