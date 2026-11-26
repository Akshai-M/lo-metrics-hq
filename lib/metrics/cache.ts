/**
 * In-memory caches for the API. A run's rows never change once saved, so they are loaded from
 * Postgres once per run (about 9k rows, ~1s over the network) and every request after that only
 * filters and counts them in memory.
 *
 *  - latest run id: re-checked at most every RUN_TTL ms, so a run saved by another process
 *    (bun run refresh, a Vercel instance) shows up within that time.
 *  - rows, run details and placements: kept per run / per placement import.
 *
 * clearCaches() is called when this process finishes a run.
 */
import { loadRows, type Row } from "./filters";
import { competencyBreakdown, eventIssues, eventStatus, latestPlacements, latestRun, placementImportInfo } from "./store";

const RUN_TTL = 30_000;
const PLACEMENT_TTL = 60_000;

type Run = NonNullable<Awaited<ReturnType<typeof latestRun>>>;
type Placements = Awaited<ReturnType<typeof latestPlacements>>;

let run: { at: number; value: Promise<Run | null> } | null = null;
let rows: { runId: string; value: Promise<Row[]> } | null = null;
let details: { runId: string; at: number; value: Promise<RunDetails> } | null = null;
let placements: { at: number; value: Promise<Placements> } | null = null;

/** Drop a failed load so the next request retries instead of serving the error. */
function keep<T>(p: Promise<T>, reset: () => void) {
  p.catch(reset);
  return p;
}

export function cachedLatestRun(): Promise<Run | null> {
  if (!run || Date.now() - run.at > RUN_TTL) run = { at: Date.now(), value: keep(latestRun(), () => (run = null)) };
  return run.value;
}

export function cachedRows(runId: string): Promise<Row[]> {
  if (rows?.runId !== runId) rows = { runId, value: keep(loadRows(runId), () => (rows = null)) };
  return rows.value;
}

type RunDetails = {
  competencies: Awaited<ReturnType<typeof competencyBreakdown>>;
  eventStatus: Awaited<ReturnType<typeof eventStatus>>;
  issues: Awaited<ReturnType<typeof eventIssues>>;
  placements: Awaited<ReturnType<typeof placementImportInfo>>;
};

/** Coverage and placement-import info for the Data health tab (refreshed with the placements TTL). */
export function cachedRunDetails(runId: string): Promise<RunDetails> {
  if (details?.runId !== runId || Date.now() - details.at > PLACEMENT_TTL) {
    const value = Promise.all([competencyBreakdown(runId), eventStatus(runId), eventIssues(runId), placementImportInfo()]).then(
      ([competencies, statuses, issues, info]) => ({ competencies, eventStatus: statuses, issues, placements: info })
    );
    details = { runId, at: Date.now(), value: keep(value, () => (details = null)) };
  }
  return details.value;
}

export function cachedPlacements(): Promise<Placements> {
  if (!placements || Date.now() - placements.at > PLACEMENT_TTL) placements = { at: Date.now(), value: keep(latestPlacements(), () => (placements = null)) };
  return placements.value;
}

export function clearCaches() {
  run = rows = details = placements = null;
}
