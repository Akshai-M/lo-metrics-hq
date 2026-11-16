/**
 * Apps Script web app client (APPS_SCRIPT_ENDPOINT).
 *  - action=events     -> assessment events from the master tracker
 *  - action=subsheets  -> tabs by exact name (repeat &subsheet=)
 * Raw responses are cached under data/raw so a run can re-fetch only what failed.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { TABS } from "./config";
import type { AssessmentEvent, Row } from "./competency";

const RAW_DIR = join(process.cwd(), "data", "raw");
const RESULTS_DIR = join(RAW_DIR, "results");

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

async function call(params: [string, string][], attempts = 4): Promise<ScriptResponse> {
  const url = `${endpoint()}?${new URLSearchParams(params).toString()}`;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
      return await res.json();
    } catch (err) {
      last = err;
      await Bun.sleep(2000 * (i + 1));
    }
  }
  throw last;
}

export async function fetchEvents(refresh: boolean): Promise<AssessmentEvent[]> {
  await mkdir(RAW_DIR, { recursive: true });
  const file = Bun.file(join(RAW_DIR, "events.json"));
  let data: { events: Omit<AssessmentEvent, "idx">[] };
  if (!refresh && (await file.exists())) {
    data = await file.json();
  } else {
    const res = await call([["action", "events"]]);
    if (!Array.isArray(res.events)) throw new Error(`events endpoint returned no events: ${JSON.stringify(res).slice(0, 200)}`);
    data = { events: res.events };
    await Bun.write(file, JSON.stringify(data, null, 1));
  }
  return data.events.map((e, idx) => ({ ...e, idx }));
}

/** Picks which tabs to read, per the agreed priority. */
export function chooseTabs(available: string[]): { rule: string | null; names: string[] } {
  const resultTab = available.find((n) => n.toLowerCase().includes("result"));
  if (resultTab) return { rule: "result-tab", names: [resultTab] };
  const stripped = new Map(available.map((n) => [n.trim(), n]));
  const normal = TABS.normal.map((n) => stripped.get(n)).find(Boolean);
  const tsb = stripped.get(TABS.tsb);
  if (tsb && normal) return { rule: "TSB+Normal", names: [tsb, normal] };
  const main = stripped.get(TABS.main);
  if (main) return { rule: "Sheet1", names: [main] };
  return { rule: null, names: [] };
}

async function fetchResult(idx: number, link: string): Promise<CachedResult> {
  let available: string[] = [];
  let data: CachedResult | null = null;
  let error = "";
  try {
    // Call 1: discover tab names (availableSubsheets lists every tab, found or not).
    const discover = await call([["action", "subsheets"], ["link", link], ...[TABS.main, TABS.tsb, ...TABS.normal].map((n) => ["subsheet", n] as [string, string])]);
    available = discover?.availableSubsheets ?? [];
    error = discover?.error ?? "";
    const { rule, names } = chooseTabs(available);
    if (rule) {
      // Call 2: fetch the chosen tabs (the endpoint matches trimmed names).
      const got = await call([["action", "subsheets"], ["link", link], ...names.map((n) => ["subsheet", n.trim()] as [string, string])]);
      const subs = got?.subsheets ?? {};
      const rows: Row[] = [];
      const read: string[] = [];
      for (const n of names) {
        const tab = subs[n.trim()];
        if (!tab) continue;
        for (const r of tab.rows as Row[]) rows.push({ ...r, _source: n.trim() });
        read.push(n.trim());
      }
      if (read.length) data = { rule, subsheetName: read.join(" + "), rowCount: rows.length, rows, link, availableSubsheets: available };
      else error = got?.error ?? "chosen tabs returned no data";
    } else if (!error) {
      error = "no usable tab (none with 'result', TSB+Normal, or Sheet1)";
    }
  } catch (err) {
    error = `request failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  const out: CachedResult = data ?? { error, link, availableSubsheets: available };
  await Bun.write(join(RESULTS_DIR, `${idx}.json`), JSON.stringify(out));
  return out;
}

export async function loadCachedResult(idx: number): Promise<CachedResult | null> {
  const f = Bun.file(join(RESULTS_DIR, `${idx}.json`));
  return (await f.exists()) ? f.json() : null;
}

/**
 * Ensures every event with a link has a cached result.
 * refresh: re-fetch all; refreshErrors: re-fetch only cached errors.
 */
export async function ensureResults(
  events: AssessmentEvent[],
  inScope: (e: AssessmentEvent) => boolean,
  opts: { refresh: boolean; refreshErrors: boolean },
  log: (msg: string) => void = () => {}
) {
  await mkdir(RESULTS_DIR, { recursive: true });
  const todo: AssessmentEvent[] = [];
  for (const e of events) {
    if (!e.resultsLink || !inScope(e)) continue;
    const cached = await loadCachedResult(e.idx);
    if (opts.refresh || !cached || (opts.refreshErrors && "error" in cached)) todo.push(e);
  }
  if (!todo.length) return;
  log(`Fetching ${todo.length} results sheet(s)...`);
  const queue = [...todo];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const r = await fetchResult(e.idx, e.resultsLink!);
      log(`  event ${e.idx}: ${"error" in r ? `ERR ${r.error}` : `ok (${r.rule}: ${r.subsheetName})`}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}
