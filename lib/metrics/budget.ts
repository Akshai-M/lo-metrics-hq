/**
 * Time budget for one refresh. The hosted function has a hard limit, so a run stops fetching when
 * its budget is used up. Nothing is saved for a paused run: the sheets already read are kept in the
 * database, and the next click continues from there.
 */

/** Thrown when the budget runs out. The run is recorded as "partial"; no metrics are saved. */
export class RunPaused extends Error {}

/** Longest single request to Apps Script. */
const REQUEST_TIMEOUT_MS = 180_000;

/** Milliseconds left before the deadline (Infinity when there is no deadline). */
export function remaining(deadline?: number): number {
  return deadline === undefined ? Infinity : deadline - Date.now();
}

/** Throws RunPaused once the deadline has passed. */
export function checkBudget(deadline: number | undefined, what: string) {
  if (remaining(deadline) <= 0) throw new RunPaused(`Paused at the time limit before ${what}.`);
}

/** Timeout for one request: at most REQUEST_TIMEOUT_MS, and never more than the time left (min 10 s). */
export function requestTimeout(deadline?: number): number {
  return Math.max(10_000, Math.min(REQUEST_TIMEOUT_MS, remaining(deadline)));
}
