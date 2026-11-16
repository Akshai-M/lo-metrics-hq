/**
 * Run the metrics pipeline from the terminal.
 *   bun run refresh                    use cached sheets where present
 *   bun run refresh --refresh          re-fetch events and every results sheet
 *   bun run refresh --refresh-errors   re-fetch only sheets that failed last time
 *   bun run refresh --no-db            compute and write output/ files only
 */
import { runPipeline } from "./pipeline";

const args = new Set(process.argv.slice(2));
const result = await runPipeline({
  refresh: args.has("--refresh"),
  refreshErrors: args.has("--refresh-errors"),
  persist: !args.has("--no-db"),
  log: (m) => console.log(m),
});

console.log(result.summaryMd);
console.log(result.runId ? `Saved run ${result.runId} to DATABASE_URL.` : "DB write skipped (--no-db).");
process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
