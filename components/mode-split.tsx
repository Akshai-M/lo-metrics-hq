"use client";

import { useState } from "react";
import type { Splits, TrLevels } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Row = Splits["overall"]["rows"][number];
type YogGroup = Splits["yog"][number];

type Mode = "Online" | "Offline" | "TR";
const BAR: Record<Mode, string> = { Online: "bg-online", Offline: "bg-offline", TR: "bg-tr" };
const TEXT: Record<Mode, string> = { Online: "text-online-text", Offline: "text-offline-text", TR: "text-tr-text" };
const HEAD: Record<Mode, string> = { Online: "Online mode", Offline: "Offline mode", TR: "TR (technical round)" };

const n = (v: number) => v.toLocaleString();
const pct = (v: number | null, d = 2) => (v === null ? "—" : `${v.toFixed(d)}%`);
const delta = (r: Row) => {
  const on = r.modes.Online?.clearPct ?? null;
  const off = r.modes.Offline?.clearPct ?? null;
  return on === null || off === null ? null : Math.round((on - off) * 10) / 10;
};

function LevelChips({ levels }: { levels: TrLevels["levels"] }) {
  if (!levels.length) return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {levels.map((l) => (
        <span key={l.level} className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs">
          {l.level} <span className="font-semibold">{l.count}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Competency x (Online, Offline, TR) attempted / cleared / clear %, plus Online − Offline in
 * percentage points, and optionally the level split of TR-cleared students.
 */
export function ModeTable({ rows, total, levels, modes }: { rows: Row[]; total: Row; levels?: TrLevels[]; modes: string[] }) {
  const sep = "border-l";
  const MODES = modes as Mode[];
  const showDelta = modes.includes("Online") && modes.includes("Offline");
  return (
    <Table className="tabular">
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead rowSpan={2} className="sticky left-0 z-10 bg-muted pl-5 align-bottom">Competency</TableHead>
          {MODES.map((m) => (
            <TableHead key={m} colSpan={3} className={cn(sep, "h-9 text-center font-semibold", TEXT[m])}>
              {HEAD[m]}
            </TableHead>
          ))}
          {levels && (
            <TableHead rowSpan={2} className={cn(sep, "min-w-56 align-bottom text-tr-text")}>
              TR cleared, by level
            </TableHead>
          )}
          {showDelta && <TableHead rowSpan={2} className={cn(sep, "pr-5 text-right align-bottom")}>Online − Offline</TableHead>}
        </TableRow>
        <TableRow className="hover:bg-transparent">
          {MODES.flatMap((m) => [
            <TableHead key={`${m}-a`} className={cn(sep, "h-9 text-right text-xs")}>Attempted</TableHead>,
            <TableHead key={`${m}-c`} className="h-9 text-right text-xs">Cleared</TableHead>,
            <TableHead key={`${m}-p`} className="h-9 text-right text-xs">Clear %</TableHead>,
          ])}
        </TableRow>
      </TableHeader>
      <TableBody className="font-mono">
        {[...rows, total].map((r) => {
          const isTotal = r === total;
          const d = delta(r);
          return (
            <TableRow key={r.competency} className={cn(isTotal && "border-t-2 bg-muted/40 font-semibold hover:bg-muted/40")}>
              <TableCell className={cn("sticky left-0 z-10 pl-5 font-sans", isTotal ? "bg-muted" : "bg-card font-medium")}>{r.competency}</TableCell>
              {MODES.flatMap((m) => {
                const c = r.modes[m];
                const empty = c.attempted === 0;
                return [
                  <TableCell key={`${m}-a`} className={cn(sep, "text-right", empty && "text-muted-foreground/60")}>{n(c.attempted)}</TableCell>,
                  <TableCell key={`${m}-c`} className={cn("text-right", empty && "text-muted-foreground/60")}>{n(c.cleared)}</TableCell>,
                  <TableCell key={`${m}-p`} className={cn("text-right font-medium", TEXT[m])}>{pct(c.clearPct)}</TableCell>,
                ];
              })}
              {levels && (
                <TableCell className={cn(sep, "font-sans")}>
                  {isTotal ? null : <LevelChips levels={levels.find((l) => l.competency === r.competency)?.levels ?? []} />}
                </TableCell>
              )}
              {showDelta && (
                <TableCell className={cn(sep, "pr-5 text-right", d === null ? "text-muted-foreground/60" : d >= 0 ? "text-positive" : "text-negative")}>
                  {d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Meter({ value, className, thick }: { value: number | null; className: string; thick?: boolean }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", thick ? "h-2.5" : "h-1.5")}>
      {value !== null && <div className={cn("h-full rounded-full", className)} style={{ width: `${Math.min(100, value)}%` }} />}
    </div>
  );
}

function Legend({ modes }: { modes: Mode[] }) {
  return (
    <div className="flex gap-4 text-xs text-muted-foreground">
      {modes.map((m) => (
        <span key={m} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[2px]", BAR[m])} />
          {m}
        </span>
      ))}
    </div>
  );
}

/** Online vs offline vs TR clearance: totals, then each competency as a group of bars. */
export function ModeBenchmark({ split, modes, index = "01" }: { split: Splits["overall"]; modes: string[]; index?: string }) {
  const MODES = modes as Mode[];
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="eyebrow">{index} — Mode benchmark · as of {split.asOf ?? "n/a"}</div>
        <CardTitle className="font-serif text-2xl font-normal">Clearance by mode</CardTitle>
        <CardDescription>Totals are unique students across the selected competencies, before YOG segmentation.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-8">
        <div className="flex flex-col gap-3">
          {MODES.map((m) => {
            const c = split.total.modes[m];
            return (
              <div key={m}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-sm font-medium", TEXT[m])}>{m} · unique students</span>
                  <span className="font-mono text-xs tabular-nums">
                    <span className="font-semibold">{pct(c.clearPct)}</span>{" "}
                    <span className="text-muted-foreground">({n(c.cleared)} / {n(c.attempted)})</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <Meter value={c.clearPct} className={BAR[m]} thick />
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="eyebrow">Clearance % by competency</span>
            <Legend modes={MODES} />
          </div>
          <ul className="flex flex-col gap-3">
            {split.rows.map((r) => (
              <li key={r.competency} className="grid grid-cols-[56px_1fr_40px] items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium" style={{ gridRow: `span ${MODES.length}` }}>{r.competency}</span>
                {MODES.map((m) => [
                  <Meter key={`${m}-b`} value={r.modes[m].clearPct} className={BAR[m]} />,
                  <span key={`${m}-v`} className="text-right font-mono text-xs tabular-nums text-muted-foreground" aria-label={`${r.competency} ${m}`}>
                    {r.modes[m].clearPct === null ? "—" : `${Math.round(r.modes[m].clearPct!)}%`}
                  </span>,
                ])}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/** Overall split by mode, as a card. */
export function OverallModeCard({
  split,
  modes,
  index = "02",
  trCount,
}: {
  split: Splits["overall"];
  modes: string[];
  index?: string;
  trCount?: Splits["trCount"];
}) {
  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardHeader className="border-b py-5">
        <div className="eyebrow">{index} — Snapshot · as of {split.asOf ?? "n/a"}</div>
        <CardTitle className="font-serif text-2xl font-normal">Competency split by mode</CardTitle>
        <CardDescription>
          Distinct students per competency and mode. The Total row counts each student once across the selected competencies.
          {trCount === "interviews" && " TR is counted per interview."}
          {modes.includes("TR") && " TR levels are for TR-cleared students."}
        </CardDescription>
      </CardHeader>
      <ModeTable rows={split.rows} total={split.total} levels={modes.includes("TR") ? split.trLevels : undefined} modes={modes} />
    </Card>
  );
}

/** Pick a graduation cohort and see its online / offline split. */
const STRIP_COLS: Record<number, string> = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" };

export function YogCohortSplits({ groups, modes, index = "03" }: { groups: YogGroup[]; modes: string[]; index?: string }) {
  const MODES = modes as Mode[];
  const [yog, setYog] = useState(groups[0]?.yog ?? "");
  if (!groups.length) return null;
  const g = groups.find((x) => x.yog === yog) ?? groups[0];
  const items = groups.map((x) => ({ value: x.yog, label: `YOG ${x.yog} (${n(x.students)})` }));

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardHeader className="flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
        <div className="eyebrow">{index} — Cohorts</div>
        <CardTitle className="font-serif text-2xl font-normal">Year of graduation splits</CardTitle>
        <CardDescription>Pick a cohort to see its online, offline and TR clearance. Students missing from the academy users file are Unknown.</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="eyebrow">Cohort</span>
          <Select value={g.yog} items={items} onValueChange={(v) => v && setYog(v)}>
            <SelectTrigger className="min-w-48 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width) max-w-[calc(100vw-2rem)]">
              {items.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <div className={cn("grid grid-cols-2 gap-px border-b bg-border", STRIP_COLS[2 + MODES.length])}>
        {[
          { k: "Cohort", v: `YOG ${g.yog}`, cls: "", span: "col-span-2 sm:col-span-1" },
          { k: "Students", v: n(g.students), cls: "font-mono" },
          ...MODES.map((m) => ({ k: `${m} clearance`, v: pct(g.total.modes[m]?.clearPct ?? null), cls: cn("font-mono", TEXT[m]) })),
        ].map((s) => (
          <div key={s.k} className={cn("bg-card px-5 py-3", "span" in s && s.span)}>
            <div className="eyebrow">{s.k}</div>
            <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", s.cls)}>{s.v}</div>
          </div>
        ))}
      </div>

      <ModeTable rows={g.rows} total={g.total} modes={modes} />
    </Card>
  );
}
