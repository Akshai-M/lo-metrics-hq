/**
 * Load placement data into the database (separate from the assessment refresh).
 *   bun run placements                      reads data/placements.csv
 *   bun run placements "<path to export>"   reads the "Academy All Placed" export directly
 * Only id, dates, status, type, channel and company type are stored (see placements.ts).
 * Replaces the previous import; the dashboard always shows the latest one.
 */
import { basename } from "node:path";
import { loadPlacements } from "./placements";
import { importPlacements } from "./store";

const path = process.argv[2];
const { file, rows, skipped } = await loadPlacements(path || undefined);
if (!file) {
  console.error(`No file at ${path ?? "data/placements.csv"}.`);
  process.exit(1);
}
const id = await importPlacements(rows, basename(path ?? "data/placements.csv"));
console.log(`Imported ${rows.length} placement records (${new Set(rows.map((r) => r.candidateId)).size} students, ${skipped} blank rows skipped). Import ${id}.`);
process.exit(0);
