import type { Overview, Stage } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type F = Overview["funnel"];
type S = F["stages"][number];

const BAR: Record<string, string> = { Online: "bg-online", Offline: "bg-offline", TR: "bg-tr" };
const pct = (c: S["conversion"]) => (c && c.pct !== null ? `${c.pct.toFixed(1)}%` : "—");
const stageLabel = (s: S) => `${s.mode} ${s.step}`;
const STAGE_NAME: Record<Stage, string> = { offline: "Offline cleared", tr: "TR cleared", both: "Offline and TR cleared" };

/** Same-student conversion from the previous stage, as a sentence. */
function conversionLabel(prev: S, s: S) {
  const p = <span className="font-mono font-semibold text-foreground tabular-nums">{pct(s.conversion)}</span>;
  const n = s.conversion ? ` (${s.conversion.num.toLocaleString()} / ${s.conversion.den.toLocaleString()})` : "";
  if (s.step === "cleared")
    return (
      <>
        of students who attempted {s.mode}, {p} cleared it{n}
      </>
    );
  return (
    <>
      of students who cleared {prev.mode}, {p} attempted {s.mode}
      {n}
      {s.mode === "TR" && " · capacity-limited, not performance"}
    </>
  );
}

/** Stage after which students enter the placement pool, as a funnel stage index (or -1). */
function poolIndex(stages: S[], pool: Stage) {
  const target = pool === "offline" ? "Offline" : "TR";
  return stages.findIndex((s) => s.mode === target && s.step === "cleared");
}

export function StageFunnel({ funnel, poolEntry, online, index = "01" }: { funnel: F; poolEntry: Stage; online: boolean; index?: string }) {
  const { stages } = funnel;
  const top = stages[0]?.count ?? 0;
  const pool = poolIndex(stages, poolEntry);

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardHeader className="border-b py-5">
        <div className="eyebrow">{index} — Stage funnel</div>
        <CardTitle className="font-serif text-2xl font-normal">From attempt to TR</CardTitle>
        <CardDescription>
          Distinct students. Each stage counts everyone who reached it in a competency, whatever their path; the lines between stages
          follow the same students in the same competency.
          {!online && " Online is off, so the funnel starts at Offline."} TR is not a gate; the placement pool opens after{" "}
          {STAGE_NAME[poolEntry]}.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-5">
        {stages.length === 0 || top === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this selection.</p>
        ) : (
          <ol className="flex flex-col">
            {stages.map((s, i) => (
              <li key={stageLabel(s)}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground sm:ml-[188px]">
                    <span>{conversionLabel(stages[i - 1], s)}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[180px_1fr] sm:gap-2">
                  <span className="text-sm">
                    <span className="font-medium">{stageLabel(s)}</span>
                    {s.mode === "TR" && s.step === "attempted" && (
                      <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">capacity-limited</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className={cn("h-full rounded", BAR[s.mode], s.step === "attempted" && "opacity-45")}
                        style={{ width: `${Math.max(0.5, (100 * s.count) / top)}%` }}
                      />
                    </div>
                    <span className="w-14 text-right font-mono text-sm font-semibold tabular-nums">{s.count.toLocaleString()}</span>
                  </div>
                </div>
                {i === pool && (
                  <div className="mt-1 border-t border-dashed border-primary/50 pt-1 text-xs font-medium text-primary sm:ml-[188px]">
                    Placement pool entry
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        <OffPathNotes offPath={funnel.offPath} />
      </CardContent>
      <FunnelTable funnel={funnel} />
    </Card>
  );
}

function OffPathNotes({ offPath }: { offPath: Record<string, number> }) {
  const notes = [
    offPath.Offline > 0 &&
      `${offPath.Offline.toLocaleString()} students attempted offline in a competency with no online clearance on record in it; they are counted at Offline but not in the Online → Offline conversion.`,
    offPath.TR > 0 &&
      `${offPath.TR.toLocaleString()} students had a TR interview in a competency without an offline clearance on record in it; they are counted at TR but not in the Offline → TR conversion.`,
  ].filter(Boolean);
  if (!notes.length) return null;
  return (
    <ul className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
      {notes.map((n) => (
        <li key={n as string}>• {n}</li>
      ))}
    </ul>
  );
}

/** Same funnel per competency: stage counts with the same-student conversion from the previous stage. */
function FunnelTable({ funnel }: { funnel: F }) {
  const head = funnel.stages;
  if (!head.length) return null;
  return (
    <div className="border-t">
      <Table className="tabular">
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Competency</TableHead>
            {head.map((s) => (
              <TableHead key={stageLabel(s)} className="text-right last:pr-5">
                {stageLabel(s)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono">
          {funnel.byCompetency.map((c) => (
            <TableRow key={c.competency}>
              <TableCell className="pl-5 font-sans font-medium">{c.competency}</TableCell>
              {c.stages.map((s, i) => (
                <TableCell key={stageLabel(s)} className={cn("text-right last:pr-5", s.count === 0 && "text-muted-foreground/60")}>
                  {s.count.toLocaleString()}
                  {i > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({pct(s.conversion)})</span>}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
