/**
 * Placements from data/placements.csv: the "Academy All Placed" export (one row per placement
 * record, so a student can have several). Columns are found by header name, so the raw export can
 * be dropped in as is. Only the columns below are read; names, LinkedIn, company names, remarks
 * and the rest are ignored and never stored.
 *
 *   user id                  candidate id (UUID, same as the assessment candidate_id)
 *   Date of Entry            placement date used for "placed after pool entry"
 *   Placement Status         Placed | Placed More Opps
 *   Latest Placement Status
 *   Placed Through           NXTWAVE_PARTNER | EXTERNAL
 *   Placement Type           FULL_TIME | INTERN_CUM_FULL_TIME
 *   Company Type             MNC | STARTUP
 */
import { join } from "node:path";

const FILE = join(process.cwd(), "data", "placements.csv");

export type Placement = {
  candidateId: string;
  day: string | null; // YYYY-MM-DD, Date of Entry
  status: string;
  latestStatus: string;
  placedThrough: string;
  placementType: string;
  companyType: string;
};

/** Rows of a CSV file (quoted fields, commas and newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Jan 1, 2024" or "2024-01-01" -> "2024-01-01". */
export function placementDay(v: string): string | null {
  const s = v.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  return month < 0 ? null : `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export async function loadPlacements(): Promise<{ file: boolean; rows: Placement[]; skipped: number }> {
  const f = Bun.file(FILE);
  if (!(await f.exists())) return { file: false, rows: [], skipped: 0 };
  const [head, ...body] = parseCsv(await f.text());
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const c = {
    id: col("user id"),
    day: col("Date of Entry"),
    status: col("Placement Status"),
    latest: col("Latest Placement Status"),
    through: col("Placed Through"),
    type: col("Placement Type"),
    company: col("Company Type"),
  };
  if (c.id < 0 || c.day < 0 || c.status < 0) throw new Error("data/placements.csv: needs columns 'user id', 'Date of Entry', 'Placement Status'");
  const get = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());
  const rows: Placement[] = [];
  let skipped = 0;
  for (const r of body) {
    const id = get(r, c.id).toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      skipped++; // blank or malformed rows
      continue;
    }
    rows.push({
      candidateId: id,
      day: placementDay(get(r, c.day)),
      status: get(r, c.status),
      latestStatus: get(r, c.latest),
      placedThrough: get(r, c.through),
      placementType: get(r, c.type),
      companyType: get(r, c.company),
    });
  }
  return { file: true, rows, skipped };
}
