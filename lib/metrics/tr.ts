/**
 * TR (technical round) interviews from the post-offline sheet.
 * Only UID, date, status, clearance, level and verdict band are kept (no names or emails, also in the cache).
 */
import { TR_ATTEMPTED_STATUSES, TR_CLEARED_VALUE, TR_TABS, type CompetencyId } from "./config";
import { cacheGet, cachePut } from "./store";
import { RunPaused, checkBudget, remaining, requestTimeout } from "./budget";


export type TrInterview = {
  candidateId: string;
  competency: CompetencyId;
  tab: string;
  day: string; // YYYY-MM-DD (IST)
  status: string;
  attempted: boolean;
  cleared: boolean;
  level: string | null;
  verdict: string | null; // Verdict Band: Strong Hire / Medium Hire / Low Hire / Reject
  yog?: string | null;
};

type TrRow = { UID: string; Date: unknown; Status: string; Clearance: string; Level: string; Verdict?: string };

/** Sheet dates come as ISO timestamps (IST midnight in UTC) or as "DD/MM/YYYY" text. */
export function trDay(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

async function fetchTab(tab: string, deadline?: number): Promise<TrRow[]> {
  const url = `${process.env.APPS_SCRIPT_ENDPOINT}?${new URLSearchParams({ action: "postOfflineData", subsheet: tab })}`;
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(requestTimeout(deadline)) });
      const j = (await res.json()) as { rows?: Record<string, unknown>[]; error?: string };
      if (!Array.isArray(j.rows)) throw new Error(j.error ?? "no rows in response");
      return j.rows.map((r) => ({
        UID: String(r.UID ?? "").trim(),
        Date: r.Date,
        Status: String(r.Status ?? "").trim(),
        Clearance: String(r["Clearance Status"] ?? "").trim(),
        Level: String(r.Level ?? r.Levels ?? "").trim(),
        Verdict: String(r["Verdict Band"] ?? "").trim(),
      }));
    } catch (err) {
      last = err;
      if (remaining(deadline) <= 0) throw new RunPaused("Paused at the time limit while reading the TR tabs.");
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`TR tab "${tab}": ${last instanceof Error ? last.message : String(last)}`);
}

/** Reads every TR tab (cached under data/raw/tr unless refresh). */
/**
 * Every run re-reads all TR tabs (small), so new and updated interviews are picked up. A tab that
 * fails falls back to its last saved copy.
 */
export async function loadTr(log: (m: string) => void = () => {}, deadline?: number) {
  const interviews: TrInterview[] = [];
  const tabs: { tab: string; rows: number; interviews: number; undated: number }[] = [];
  for (const { competency, tabs: names } of TR_TABS) {
    for (const tab of names) {
      let rows: TrRow[];
      checkBudget(deadline, `reading TR tab "${tab}"`);
      try {
        log(`Fetching TR tab "${tab}"...`);
        rows = await fetchTab(tab, deadline);
        await cachePut("tr", tab, rows);
      } catch (err) {
        if (err instanceof RunPaused) throw err;
        const saved = await cacheGet<TrRow[]>("tr", tab);
        if (!saved) throw err;
        log(`TR tab "${tab}" failed (${err instanceof Error ? err.message : String(err)}); using the saved copy.`);
        rows = saved;
      }
      let n = 0;
      let undated = 0;
      for (const r of rows) {
        if (!r.UID) continue;
        const day = trDay(r.Date);
        if (!day) {
          undated++;
          continue;
        }
        n++;
        interviews.push({
          candidateId: r.UID,
          competency,
          tab,
          day,
          status: r.Status,
          attempted: TR_ATTEMPTED_STATUSES.includes(r.Status),
          cleared: r.Clearance === TR_CLEARED_VALUE,
          level: r.Level || null,
          verdict: r.Verdict || null,
        });
      }
      tabs.push({ tab, rows: rows.length, interviews: n, undated });
    }
  }
  return { interviews, tabs };
}
