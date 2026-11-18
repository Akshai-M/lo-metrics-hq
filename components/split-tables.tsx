import type { Splits } from "@/lib/api";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString();
const MODE_TEXT: Record<string, string> = { Online: "text-online-text", Offline: "text-offline-text", TR: "text-tr-text" };
const MODE_DOT: Record<string, string> = { Online: "bg-online", Offline: "bg-offline", TR: "bg-tr" };

/** Competency x mode x stage (Attempted / Qualified) by period. */
export function PeriodSplitTable({ split, action, index = "01" }: { split: Splits["period"]; action?: React.ReactNode; index?: string }) {
  const groups = new Map<string, Splits["period"]["rows"]>();
  for (const r of split.rows) {
    if (!groups.has(r.competency)) groups.set(r.competency, []);
    groups.get(r.competency)!.push(r);
  }

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardHeader className="flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
        <div className="eyebrow">{index} — Attempted &amp; qualified</div>
        <CardTitle className="font-serif text-2xl font-normal">{split.grain === "week" ? "Weekly split" : "Monthly split"}</CardTitle>
        <CardDescription>
          Distinct students per competency, mode and {split.grain === "week" ? "week (1-7, 8-14, 15-21, 22-28, 29-end of each month)" : "month"}.
          A dash means no exam in that period.
        </CardDescription>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <Table className="tabular">
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 bg-muted pl-5">Competency</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Stage</TableHead>
            {split.columns.map((c) => (
              <TableHead key={c.key} className="text-right last:pr-5">
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...groups.entries()].map(([comp, rows]) =>
            rows.map((r, i) => (
              <TableRow key={`${comp}-${r.mode}-${r.stage}`} className={cn(i === 0 && "border-t-2", i % 2 === 0 && "border-b-0")}>
                {i === 0 && (
                  <TableCell rowSpan={rows.length} className="sticky left-0 z-10 bg-card pl-5 align-top font-medium">
                    {comp}
                  </TableCell>
                )}
                {i % 2 === 0 && (
                  <TableCell rowSpan={2} className="align-top">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", MODE_TEXT[r.mode])}>
                      <span className={cn("size-2 rounded-full", MODE_DOT[r.mode])} />
                      {r.mode}
                    </span>
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">{r.stage}</TableCell>
                {r.values.map((v, j) => (
                  <TableCell
                    key={split.columns[j].key}
                    className={cn("text-right font-mono last:pr-5", v === null && "text-muted-foreground/60", r.stage === "Qualified" && v !== null && "font-semibold")}
                  >
                    {v === null ? "–" : n(v)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
