/**
 * Apps Script web app client (APPS_SCRIPT_ENDPOINT).
 *  - action=events     -> assessment events from the master tracker
 *  - action=subsheets  -> tabs by exact name (repeat &subsheet=)
 * Responses are cached in the database (ft_comp_source_cache), keyed by the sheet link, with
 * personal fields removed. A run fetches only the sheets that are not cached yet, or that were
 * empty / failed last time.
 */
import { TABS } from "./config";
import type { AssessmentEvent, Row } from "./competency";
import { cacheGet, cacheGetAll, cachePut } from "./store";
import { RunPaused, checkBudget, remaining, requestTimeout } from "./budget";

/** Columns that identify a person or their device. The pipeline never reads them. */
export const PERSONAL_KEYS = ["name", "mobile", "email", "ip_addresses", "candidate_report_link", "integrity_report_link", "Location", "seb_metadata"];

export type CachedResult =
  | { rule: string; subsheetName: string; rowCount: number; rows: Row[]; link: string; availableSubsheets: string[] }
  | { error: string; link: string; availableSubsheets: string[] };

function endpoint() {
  const url = process.env.APPS_SCRIPT_ENDPOINT;
  if (!url) throw new Error("APPS_SCRIPT_ENDPOINT is not set in .env");
  return url;
}

/** Shape of the Apps Script JSON responses this client uses. */
type ScriptResponse = {
  events?: Omit<AssessmentEvent, "idx">[];
  subsheets?: Record<string, { subsheetName: string; rowCount: number; rows: Row[] }>;
  availableSubsheets?: string[];
  notFound?: string[];
  error?: string;
};

async function call(params: [string, string][], attempts = 4, deadline?: number): Promise<ScriptResponse> {
  const url = `${endpoint()}?${new URLSearchParams(params).toString()}`;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(requestTimeout(deadline)) });
      return await res.json();
    } catch (err) {
      last = err;
      if (remaining(deadline) <= 0) throw new RunPaused("Paused at the time limit while reading a sheet.");
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw last;
}

/** The event list is re-read on every run (it is small); if the endpoint fails, the last saved list is used. */
export async function fetchEvents(log: (msg: string) => void = () => {}, deadline?: number): Promise<AssessmentEvent[]> {
  type Events = Omit<AssessmentEvent, "idx">[];
  let events: Events;
  try {
    const res = await call([["action", "events"]], 4, deadline);
    if (!Array.isArray(res.events)) throw new Error(`events endpoint returned no events: ${JSON.stringify(res).slice(0, 200)}`);
    events = res.events;
    await cachePut("events", "list", { events });
  } catch (err) {
    const saved = await cacheGet<{ events: Events }>("events", "list");
    if (!saved || err instanceof RunPaused) throw err;
    log(`Event list not refreshed (${err instanceof Error ? err.message : String(err)}); using the saved list.`);
    events = saved.events;
  }
  return events.map((e, idx) => ({ ...e, idx }));
}

/** Drops personal columns from every row of a result (the pipeline does not use them). */
export function withoutPersonal(out: CachedResult): CachedResult {
  if (!("rows" in out)) return out;
  const rows = out.rows.map((r) => {
    const clean = { ...r };
    for (const k of PERSONAL_KEYS) delete clean[k];
    return clean;
  });
  return { ...out, rows };
}

/** Picks which tabs to read, per the agreed priority. */
export function chooseTabs(available: string[]): { rule: string | null; names: string[] } {
  // Every results tab (e.g. "TSB Results" + "Normal Results" + "2nd Normal Results"), read together.
  const resultTabs = available.filter((n) => n.toLowerCase().includes("result"));
  if (resultTabs.length) return { rule: "result-tab", names: resultTabs };
  const stripped = new Map(available.map((n) => [n.trim(), n]));
  // Exact names first, then the variants seen in later sheets: "Normal Assessment",
  // "TSB Assessment", and the misspelt "TBS Assesment".
  const starts = (prefixes: string[]) => available.find((n) => prefixes.some((p) => n.trim().toLowerCase().startsWith(p)));
  const normal = TABS.normal.map((n) => stripped.get(n)).find(Boolean) ?? starts(["normal"]);
  const tsb = stripped.get(TABS.tsb) ?? starts(["tsb", "tbs"]);
  if (tsb && normal) return { rule: "TSB+Normal", names: [tsb, normal] };
  const main = stripped.get(TABS.main);
  if (main) return { rule: "Sheet1", names: [main] };
  return { rule: null, names: [] };
}

async function fetchResult(idx: number, link: string, deadline?: number): Promise<CachedResult> {
  let available: string[] = [];
  let data: CachedResult | null = null;
  let error = "";
  try {
    // Call 1: discover tab names (availableSubsheets lists every tab, found or not).
    const discover = await call([["action", "subsheets"], ["link", link], ...[TABS.main, TABS.tsb, ...TABS.normal].map((n) => ["subsheet", n] as [string, string])], 4, deadline);
    available = discover?.availableSubsheets ?? [];
    error = discover?.error ?? "";
    let { rule, names } = chooseTabs(available);
    // Some exports leave Sheet1 empty and put the rows in a "users_completed_assessment_stats__<id>" tab.
    const stats = available.find((n) => n.trim().toLowerCase().startsWith("users_completed_assessment_stats"));
    if (rule === "Sheet1" && stats) {
      const probe = await call([["action", "subsheets"], ["link", link], ["subsheet", names[0].trim()]], 4, deadline);
      if (!(probe?.subsheets?.[names[0].trim()]?.rows ?? []).length) ({ rule, names } = { rule: "stats-tab", names: [stats] });
    }
    if (rule) {
      // Call 2: fetch the chosen tabs (the endpoint matches trimmed names).
      const got = await call([["action", "subsheets"], ["link", link], ...names.map((n) => ["subsheet", n.trim()] as [string, string])], 4, deadline);
      const subs = got?.subsheets ?? {};
      const rows: Row[] = [];
      const read: string[] = [];
      // A candidate listed in two tabs for the same sitting (same attempted_on) is kept once.
      const seen = new Set<string>();
      for (const n of names) {
        const tab = subs[n.trim()];
        if (!tab) continue;
        for (const r of tab.rows as Row[]) {
          const key = `${r.candidate_id}|${r.attempted_on ?? ""}`;
          if (names.length > 1 && r.candidate_id && seen.has(key)) continue;
          seen.add(key);
          rows.push({ ...r, _source: n.trim() });
        }
        read.push(n.trim());
      }
      if (read.length) data = { rule, subsheetName: read.join(" + "), rowCount: rows.length, rows, link, availableSubsheets: available };
      else error = got?.error ?? "chosen tabs returned no data";
    } else if (!error) {
      error = "no usable tab (none with 'result', TSB+Normal, or Sheet1)";
    }
  } catch (err) {
    if (err instanceof RunPaused) throw err;
    error = `request failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  const out = withoutPersonal(data ?? { error, link, availableSubsheets: available });
  await cachePut("result", link, out);
  return out;
}

/** The saved result of one results sheet, by its link. */
export async function loadCachedResult(link: string): Promise<CachedResult | null> {
  return cacheGet<CachedResult>("result", link);
}

/**
 * Ensures every event with a link has a cached result.
 * refresh: re-read every sheet; otherwise only sheets not read yet, failed or empty.
 */
export async function ensureResults(
  events: AssessmentEvent[],
  inScope: (e: AssessmentEvent) => boolean,
  opts: { refresh: boolean; deadline?: number },
  log: (msg: string) => void = () => {}
) {
  const saved = await cacheGetAll<CachedResult>("result");
  const todo: AssessmentEvent[] = [];
  for (const e of events) {
    if (!e.resultsLink || !inScope(e)) continue;
    const cached = saved.get(e.resultsLink);
    // Incremental (default): sheets not read yet, failed last time, or empty (results not entered yet).
    // refresh: re-read every sheet.
    const unfinished = !cached || "error" in cached || cached.rowCount === 0;
    if (opts.refresh || unfinished) todo.push(e);
  }
  if (!todo.length) return;
  log(`Fetching ${todo.length} results sheet(s)...`);
  const queue = [...todo];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      checkBudget(opts.deadline, "reading the next sheet");
      const r = await fetchResult(e.idx, e.resultsLink!, opts.deadline);
      log(`  event ${e.idx}: ${"error" in r ? `ERR ${r.error}` : `ok (${r.rule}: ${r.subsheetName})`}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}
