/**
 * Loads each student's year of graduation into the database (the pipeline reads it from there).
 *   bun run yog "<path to export.csv>"      columns: user_id, YOG
 */
import { cachePut, ensureSchema } from "./store";

const path = process.argv[2];
if (!path) {
  console.error('Usage: bun run yog "<path to export.csv>"');
  process.exit(1);
}
const file = Bun.file(path);
if (!(await file.exists())) {
  console.error(`No file at ${path}.`);
  process.exit(1);
}

const lines = (await file.text()).trim().split(/\r?\n/);
const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
const idCol = header.indexOf("user_id");
const yogCol = header.indexOf("yog");
if (idCol < 0 || yogCol < 0) {
  console.error("The file needs the columns user_id and YOG.");
  process.exit(1);
}
const map: Record<string, string> = {};
for (const line of lines.slice(1)) {
  const cells = line.split(",");
  const id = (cells[idCol] ?? "").trim();
  const yog = (cells[yogCol] ?? "").trim();
  if (id && yog) map[id] = yog;
}

await ensureSchema();
await cachePut("yog", "map", map);
console.log(`Saved ${Object.keys(map).length} YOG rows to the database.`);
process.exit(0);
