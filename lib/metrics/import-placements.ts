/**
 * Load placement data into the database (separate from the assessment refresh).
 *   bun run placements "<path to export>"   reads the "Academy All Placed" export
 * Only id, dates, status, type, channel and company type are stored (see placements.ts).
 * Replaces the previous import; the dashboard always shows the latest one.
 */
import { basename } from "node:path";
import { loadPlacements } from "./placements";
import { importPlacements } from "./store";

const path = process.argv[2];
if (!path) {
  console.error('Usage: bun run placements "<path to export.csv>"');
  process.exit(1);
}
const { file, rows, skipped } = await loadPlacements(path);
if (!file) {
  console.error(`No file at ${path}.`);
  process.exit(1);
}
const id = await importPlacements(rows, basename(path));
console.log(`Imported ${rows.length} placement records (${new Set(rows.map((r) => r.candidateId)).size} students, ${skipped} blank rows skipped). Import ${id}.`);
process.exit(0);
