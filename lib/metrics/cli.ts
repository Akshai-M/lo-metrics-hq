/**
 * Run the metrics pipeline from the terminal.
 *   bun run refresh                    use cached sheets where present
 *   bun run refresh --refresh          re-fetch events and every results sheet
 *   bun run refresh --no-db            compute only, save nothing
 */
import { runPipeline } from "./pipeline";

const args = new Set(process.argv.slice(2));
const result = await runPipeline({
  refresh: args.has("--refresh"),
  persist: !args.has("--no-db"),
  log: (m) => console.log(m),
});

console.log(result.summaryMd);
console.log(result.runId ? `Saved run ${result.runId} to the database.` : "Nothing saved (--no-db).");
process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
