/**
 * TR (technical round) interviews from the post-offline sheet.
 * Only UID, date, status, clearance and level are kept (no names or emails, also in the cache).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { TR_ATTEMPTED_STATUSES, TR_CLEARED_VALUE, TR_TABS, type CompetencyId } from "./config";

const TR_DIR = join(process.cwd(), "data", "raw", "tr");

export type TrInterview = {
  candidateId: string;
  competency: CompetencyId;
  tab: string;
  day: string; // YYYY-MM-DD (IST)
  status: string;
  attempted: boolean;
  cleared: boolean;
  level: string | null;
  yog?: string | null;
};

type TrRow = { UID: string; Date: unknown; Status: string; Clearance: string; Level: string };

/** Sheet dates come as ISO timestamps (IST midnight in UTC) or as "DD/MM/YYYY" text. */
export function trDay(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

async function fetchTab(tab: string): Promise<TrRow[]> {
  const url = `${process.env.APPS_SCRIPT_ENDPOINT}?${new URLSearchParams({ action: "postOfflineData", subsheet: tab })}`;
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
      const j = (await res.json()) as { rows?: Record<string, unknown>[]; error?: string };
      if (!Array.isArray(j.rows)) throw new Error(j.error ?? "no rows in response");
      return j.rows.map((r) => ({
        UID: String(r.UID ?? "").trim(),
        Date: r.Date,
        Status: String(r.Status ?? "").trim(),
        Clearance: String(r["Clearance Status"] ?? "").trim(),
        Level: String(r.Level ?? r.Levels ?? "").trim(),
      }));
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`TR tab "${tab}": ${last instanceof Error ? last.message : String(last)}`);
}

/** Reads every TR tab (cached under data/raw/tr unless refresh). */
export async function loadTr(refresh: boolean, log: (m: string) => void = () => {}) {
  await mkdir(TR_DIR, { recursive: true });
  const interviews: TrInterview[] = [];
  const tabs: { tab: string; rows: number; interviews: number; undated: number }[] = [];
  for (const { competency, tabs: names } of TR_TABS) {
    for (const tab of names) {
      const file = Bun.file(join(TR_DIR, `${tab.replace(/[^A-Za-z0-9]+/g, "_")}.json`));
      let rows: TrRow[];
      if (!refresh && (await file.exists())) rows = await file.json();
      else {
        log(`Fetching TR tab "${tab}"...`);
        rows = await fetchTab(tab);
        await Bun.write(file, JSON.stringify(rows));
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
        });
      }
      tabs.push({ tab, rows: rows.length, interviews: n, undated });
    }
  }
  return { interviews, tabs };
}
