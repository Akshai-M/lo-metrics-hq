/**
 * Reattempts & duration views and failure reasons, for the filtered rows (see filters.ts).
 *
 * Unit: student x competency x track, where track = assessments (online + offline, one sequence)
 * or TR interviews, the same pairs and attempt numbers as the Reattempt % card.
 *  - attempts to clear: attempt number of the first qualifying attempt (1, 2, 3, 4+), or
 *    "not cleared yet".
 *  - days to clear: cleared pairs only; date of the first qualifying attempt minus the date of
 *    the pair's earliest attempt in the selection.
 *  - days between attempts: per pair with 2+ attempts, the median gap between consecutive
 *    attempts (by date); then the median across pairs.
 */
import { SECTION_LABELS } from "./config";
import type { Row } from "./filters";

const DAY = 86_400_000;
const dayNo = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const ATTEMPT_BUCKETS = ["1", "2", "3", "4+", "Not cleared yet"] as const;
const DAY_BUCKETS = [
  { label: "Same day", max: 0 },
  { label: "1-7 days", max: 7 },
  { label: "8-14 days", max: 14 },
  { label: "15-30 days", max: 30 },
  { label: "31+ days", max: Infinity },
];

export function reattemptViews(rows: Row[], comp: string | null) {
  const sel = comp ? rows.filter((r) => r.competency === comp) : rows;
  const pairs = new Map<string, Row[]>();
  for (const r of sel) {
    const k = `${r.candidateId}|${r.competency}|${r.mode === "TR" ? "TR" : "A"}`;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k)!.push(r);
  }

  const attempts = new Map<string, number>(ATTEMPT_BUCKETS.map((b) => [b, 0]));
  const days = DAY_BUCKETS.map(() => 0);
  const gaps: number[] = [];
  for (const items of pairs.values()) {
    items.sort((x, y) => x.attemptNo - y.attemptNo);
    const first = items.find((r) => r.qualified);
    const bucket = !first ? "Not cleared yet" : first.attemptNo >= 4 ? "4+" : String(first.attemptNo);
    attempts.set(bucket, attempts.get(bucket)! + 1);
    if (first) {
      const d = dayNo(first.day) - dayNo(items[0].day);
      days[DAY_BUCKETS.findIndex((b) => d <= b.max)]++;
    }
    if (items.length >= 2) {
      const ds = items.map((r) => dayNo(r.day));
      gaps.push(median(ds.slice(1).map((d, i) => d - ds[i]))!);
    }
  }
  const sorted = sel.map((r) => r.day).sort();
  return {
    competency: comp,
    pairs: pairs.size,
    clearedPairs: pairs.size - attempts.get("Not cleared yet")!,
    attemptsToClear: ATTEMPT_BUCKETS.map((b) => ({ bucket: b, count: attempts.get(b)! })),
    daysToClear: DAY_BUCKETS.map((b, i) => ({ bucket: b.label, count: days[i] })),
    daysBetween: { median: median(gaps), pairs: gaps.length },
    range: { from: sorted[0] ?? null, to: sorted[sorted.length - 1] ?? null },
  };
}

/**
 * Why attempts fail: not-cleared, evaluable assessment attempts (TR has no sections), one row per
 * failed gated section. An attempt that failed two sections counts once under each.
 * pct = attempts that failed the section / not-cleared attempts in that competency and mode.
 */
export function failureReasons(rows: Row[], comps: string[], modes: string[]) {
  const failed = rows.filter((r) => r.mode !== "TR" && r.qualified === false);
  return comps
    .map((competency) => ({
      competency,
      modes: modes
        .filter((m) => m !== "TR")
        .map((mode) => {
          const list = failed.filter((r) => r.competency === competency && r.mode === mode);
          const counts = new Map<string, number>();
          for (const r of list) for (const s of r.failed) counts.set(s, (counts.get(s) ?? 0) + 1);
          return {
            mode,
            failedAttempts: list.length,
            sections: [...counts]
              .sort((a, b) => b[1] - a[1])
              .map(([section, count]) => ({
                section,
                label: SECTION_LABELS[section] ?? section,
                count,
                pct: Math.round((10000 * count) / list.length) / 100,
              })),
          };
        })
        .filter((m) => m.failedAttempts > 0),
    }))
    .filter((c) => c.modes.length > 0);
}
