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
 *   POST /api/dashboard                 { tab, filters } -> everything that tab needs in one response
 *                                       (the dashboard page uses this; filters as above, in the body)
 *   GET  /api/runs                      run history
*   POST /api/refresh                   run a metrics refresh inside the request ({ refresh? })
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
import { RunPaused } from "./metrics/budget";
import { finishJob, latestJob, periods, runHistory, startJob, updateJobLog } from "./metrics/store";
import { cachedLatestRun, cachedPlacements, cachedRows, cachedRunDetails, clearCaches } from "./metrics/cache";
import { overallSplit, periodSplit, trLevelSplit, yogSplit } from "./metrics/splits";
import { overview, stages, stageTrend } from "./metrics/overview";
import { applyFilters, type FilterQuery, type Row } from "./metrics/filters";
import { failureReasons, reattemptViews } from "./metrics/reattempts";
import { studentRows } from "./metrics/students";
import { placementViews, trViews } from "./metrics/outcomes";
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

const LOG_KEEP = 200;
/** Time one run may use. The hosted function is cut off at 300 s; the rest is left for in-flight requests. */
const RUN_BUDGET_MS = 180_000;
const LOG_SAVE_EVERY_MS = 1500;

/**
 * One metrics run, recorded in ft_comp_jobs (so the status survives restarts and works on Vercel).
 * Runs inline in the request: a hosted function is only alive while its request is.
 */
async function runJob(trigger: "dashboard" | "api", opts: { refresh?: boolean }) {
  const jobId = crypto.randomUUID();
  if (!(await startJob(jobId, opts.refresh ? "full" : "incremental", trigger))) return { conflict: true as const };

  const log: string[] = [];
  let chain: Promise<void> = Promise.resolve();
  let lastSave = 0;
  const save = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastSave < LOG_SAVE_EVERY_MS) return;
    lastSave = now;
    const lines = log.slice(-LOG_KEEP);
    chain = chain.then(() => updateJobLog(jobId, lines)).catch(() => {});
  };
  const push = (m: string) => {
    log.push(m);
    save(false);
  };
  try {
    const r = await runPipeline({ refresh: opts.refresh, log: push, deadline: Date.now() + RUN_BUDGET_MS });
    clearCaches(); // serve the new run straight away
    push(`Saved run ${r.runId}: ${r.metrics.clearancePct}% (${r.metrics.clearedStudents} / ${r.metrics.attemptedStudents})`);
    await chain;
    await finishJob(jobId, "succeeded", r.runId ?? null, null, log.slice(-LOG_KEEP));
    return { conflict: false as const, jobId, runId: r.runId ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof RunPaused) {
      // Nothing is saved: the sheets read so far stay cached, and the next run carries on.
      const text = `${message} Click Refresh again to continue.`;
      push(`Paused: ${text}`);
      await chain;
      await finishJob(jobId, "partial", null, text, log.slice(-LOG_KEEP));
      return { conflict: false as const, jobId, partial: text };
    }
    push(`Failed: ${message}`);
    await chain;
    await finishJob(jobId, "failed", null, message, log.slice(-LOG_KEEP));
    return { conflict: false as const, jobId, error: message };
  }
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
});

// ---- Views, built from a run's cached rows (shared by the GET routes and POST /dashboard) ----

type Grain = "month" | "week";

function overviewView(all: Row[], q: FilterQuery, grain: Grain) {
  const { filters, options, rows, unevaluableRows } = applyFilters(all, q);
  return {
    options,
    filters,
    ...overview(rows, unevaluableRows, filters.comps, grain),
    periodsByGrain: { month: stageTrend(rows, "month"), week: stageTrend(rows, "week") },
    ...stages(rows, filters.comps, filters.modes),
  };
}

function splitsView(all: Row[], q: FilterQuery, grain: Grain) {
  const { filters, rows } = applyFilters(all, q);
  const { comps, modes } = filters;
  // TR counted per student (same as online / offline) or per interview, see TR_COUNT in config.
  const attempts = rows.map((r, i) => ({
    ...r,
    candidateId: r.mode === "TR" && TR_COUNT === "interviews" ? `${r.candidateId}#${i}` : r.candidateId,
  }));
  const tr = attempts.filter((r) => r.mode === "TR").map((r) => ({ ...r, cleared: !!r.qualified }));
  const month = periodSplit(attempts, "month", comps, modes);
  const week = periodSplit(attempts, "week", comps, modes);
  return {
    trCount: TR_COUNT,
    modes,
    period: grain === "week" ? week : month,
    // Both grains for the period charts (each chart has its own Weekly / Monthly switch).
    periods: { month, week },
    overall: { ...overallSplit(attempts, comps, modes), trLevels: modes.includes("TR") ? trLevelSplit(tr, comps) : [] },
    yog: yogSplit(attempts, comps, modes),
  };
}

/** All selected competencies together, plus each one (the competency picker switches between them without a request). */
function reattemptsView(all: Row[], q: FilterQuery) {
  const { filters, rows } = applyFilters(all, q);
  return { all: reattemptViews(rows, null), byComp: Object.fromEntries(filters.comps.map((c) => [c, reattemptViews(rows, c)])) };
}

function failuresView(all: Row[], q: FilterQuery) {
  const { filters, rows } = applyFilters(all, q);
  return { competencies: failureReasons(rows, filters.comps, filters.modes) };
}

function studentsView(all: Row[], q: FilterQuery) {
  const { rows, isActive } = applyFilters(all, q);
  return { students: studentRows(rows, isActive) };
}

async function outcomesView(all: Row[], q: FilterQuery) {
  const placements = await cachedPlacements();
  const { filters, rows } = applyFilters(all, q);
  return {
    placementImport: { importedAt: placements.importedAt, source: placements.source, records: placements.rows.length },
    placement: placementViews(rows, all, placements.rows, filters.comps),
    tr: trViews(rows, filters.comps),
  };
}

const TABS = ["overview", "splits", "yog", "competency", "reattempts", "outcomes", "students", "health"] as const;
type DashTab = (typeof TABS)[number];
const FILTER_FIELDS = ["comps", "yogs", "modes", "online", "from", "to", "attempt", "unev", "active"] as const;

/**
 * Everything one dashboard tab needs, in one response. The Period & mode split tab ignores the
 * global filters (it always includes Online); its charts send their own YOG choice.
 */
async function dashboardView(tab: DashTab, q: FilterQuery) {
  const run = await cachedLatestRun();
  if (!run) return null;
  const [all, info] = await Promise.all([cachedRows(run.runId), cachedRunDetails(run.runId)]);
  // Splits: the page's own filters (mode, YOG, dates) are applied in the browser; the chart asks for a YOG subset or a date range on Apply.
  const fq = tab === "splits" ? { online: "1", ...(q.yogs ? { yogs: q.yogs } : {}), ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}) } : q;
  const out: Record<string, unknown> = {
    tab,
    latest: { run, competencies: info.competencies, eventStatus: info.eventStatus, issues: info.issues, placements: info.placements },
    overview: overviewView(all, fq, "month"),
  };
  if (tab === "splits" || tab === "yog" || tab === "competency") out.splits = splitsView(all, fq, "month");
  if (tab === "competency") out.failures = failuresView(all, fq);
  if (tab === "reattempts") out.reattempts = reattemptsView(all, fq);
  if (tab === "students") out.students = studentsView(all, fq);
  if (tab === "overview" || tab === "outcomes") out.outcomes = await outcomesView(all, fq);
  return out;
}

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
    const run = await cachedLatestRun();
    if (!run) return status(404, { error: "No metrics run yet. POST /api/refresh to load data." });
    return { run, ...(await cachedRunDetails(run.runId)) };
  })
  .get(
    "/periods",
    async ({ query, status }) => {
      const run = await cachedLatestRun();
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
      const run = await cachedLatestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      return { runId: run.runId, ...overviewView(await cachedRows(run.runId), query, query.grain ?? "month") };
    },
    { query: filterQuery }
  )
  .get(
    "/splits",
    async ({ query, status }) => {
      const run = await cachedLatestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      return { runId: run.runId, ...splitsView(await cachedRows(run.runId), query, query.grain ?? "month") };
    },
    { query: filterQuery }
  )
  .get(
    "/reattempts",
    async ({ query, status }) => {
      const run = await cachedLatestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      const v = reattemptsView(await cachedRows(run.runId), query);
      return { runId: run.runId, ...((query.rcomp && v.byComp[query.rcomp]) || v.all) };
    },
    { query: filterQuery }
  )
  .get(
    "/failures",
    async ({ query, status }) => {
      const run = await cachedLatestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      return { runId: run.runId, ...failuresView(await cachedRows(run.runId), query) };
    },
    { query: filterQuery }
  )
  .get(
    "/students",
    async ({ query, status }) => {
      const run = await cachedLatestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      return { runId: run.runId, ...studentsView(await cachedRows(run.runId), query) };
    },
    { query: filterQuery }
  )
  .get(
    "/outcomes",
    async ({ query, status }) => {
      const run = await cachedLatestRun();
      if (!run) return status(404, { error: "No metrics run yet." });
      return { runId: run.runId, ...(await outcomesView(await cachedRows(run.runId), query)) };
    },
    { query: filterQuery }
  )
  .post(
    "/dashboard",
    async ({ body, status }) => {
      const v = await dashboardView(body.tab, body.filters ?? {});
      return v ?? status(404, { error: "No metrics run yet." });
    },
    {
      body: t.Object({
        tab: t.Union(TABS.map((x) => t.Literal(x))),
        filters: t.Optional(t.Partial(t.Object(Object.fromEntries(FILTER_FIELDS.map((k) => [k, t.String({ maxLength: 500 })])) as Record<(typeof FILTER_FIELDS)[number], ReturnType<typeof t.String>>))),
      }),
    }
  )
  .get("/runs", () => runHistory())
  .post(
    "/refresh",
    async ({ body, request, status }) => {
      const trigger = request.headers.get("x-refresh-token") ? "api" : "dashboard";
      const result = await runJob(trigger, { refresh: body?.refresh });
      if (result.conflict) return status(409, { error: "A run is already in progress" });
      if ("partial" in result) return { ok: false, partial: true, message: result.partial, jobId: result.jobId };
      if ("error" in result) return status(500, { error: result.error, jobId: result.jobId });
      return { ok: true, jobId: result.jobId, runId: result.runId };
    },
    {
      body: t.Optional(t.Object({ refresh: t.Optional(t.Boolean()) })),
    }
  )
  .get("/refresh/status", async () => {
    const j = await latestJob();
    if (!j) return { running: false, partial: false, jobId: null, kind: null, startedAt: null, finishedAt: null, lastRunId: null, lastError: null, log: [] };
    return {
      running: j.status === "running",
      partial: j.status === "partial",
      jobId: j.jobId,
      kind: j.kind,
      trigger: j.trigger,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      lastRunId: j.runId,
      lastError: j.error,
      log: j.log,
    };
  });
