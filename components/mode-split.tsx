"use client";

import { useState } from "react";
import type { Splits } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Row = Splits["overall"]["rows"][number];
type YogGroup = Splits["yog"][number];

const MODES = ["Online", "Offline"] as const;
const BAR = { Online: "bg-online", Offline: "bg-offline" };
const TEXT = { Online: "text-online-text", Offline: "text-offline-text" };

const n = (v: number) => v.toLocaleString();
const pct = (v: number | null, d = 2) => (v === null ? "—" : `${v.toFixed(d)}%`);
const delta = (r: Row) => {
  const on = r.modes.Online.clearPct;
  const off = r.modes.Offline.clearPct;
  return on === null || off === null ? null : Math.round((on - off) * 10) / 10;
};

/** Competency x (Online, Offline) attempted / cleared / clear %, plus Online − Offline in percentage points. */
export function ModeTable({ rows, total }: { rows: Row[]; total: Row }) {
  const sep = "border-l";
  return (
    <Table className="tabular">
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead rowSpan={2} className="sticky left-0 z-10 bg-muted pl-5 align-bottom">Competency</TableHead>
          {MODES.map((m) => (
            <TableHead key={m} colSpan={3} className={cn(sep, "h-9 text-center font-semibold", TEXT[m])}>
              {m} mode
            </TableHead>
          ))}
          <TableHead rowSpan={2} className={cn(sep, "pr-5 text-right align-bottom")}>Online − Offline</TableHead>
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
              <TableCell className={cn(sep, "pr-5 text-right", d === null ? "text-muted-foreground/60" : d >= 0 ? "text-positive" : "text-negative")}>
                {d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`}
              </TableCell>
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

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-muted-foreground">
      {MODES.map((m) => (
        <span key={m} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[2px]", BAR[m])} />
          {m}
        </span>
      ))}
    </div>
  );
}

/** Online vs offline clearance: totals, then each competency as a pair of bars. */
export function ModeBenchmark({ split, index = "01" }: { split: Splits["overall"]; index?: string }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="eyebrow">{index} — Mode benchmark · as of {split.asOf ?? "n/a"}</div>
        <CardTitle className="font-serif text-2xl font-normal">Online vs offline</CardTitle>
        <CardDescription>Cumulative attempts across all competencies, before YOG segmentation.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          {MODES.map((m) => {
            const c = split.total.modes[m];
            return (
              <div key={m}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-sm font-medium", TEXT[m])}>{m} total</span>
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
        <div className="border-t pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="eyebrow">Clearance % by competency</span>
            <Legend />
          </div>
          <ul className="flex flex-col gap-3">
            {split.rows.map((r) => (
              <li key={r.competency} className="grid grid-cols-[56px_1fr_40px] items-center gap-x-3 gap-y-1">
                <span className="row-span-2 text-sm font-medium">{r.competency}</span>
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
export function OverallModeCard({ split, index = "02" }: { split: Splits["overall"]; index?: string }) {
  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardHeader className="border-b py-5">
        <div className="eyebrow">{index} — Snapshot · as of {split.asOf ?? "n/a"}</div>
        <CardTitle className="font-serif text-2xl font-normal">Competency split by mode</CardTitle>
        <CardDescription>Distinct students per competency and mode, across all cohorts.</CardDescription>
      </CardHeader>
      <ModeTable rows={split.rows} total={split.total} />
    </Card>
  );
}

/** Pick a graduation cohort and see its online / offline split. */
export function YogCohortSplits({ groups, index = "03" }: { groups: YogGroup[]; index?: string }) {
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
        <CardDescription>Pick a cohort to see its online and offline clearance. Students missing from the academy users file are Unknown.</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="eyebrow">Cohort</span>
          <Select value={g.yog} items={items} onValueChange={(v) => v && setYog(v)}>
            <SelectTrigger className="min-w-48 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4">
        {[
          { k: "Cohort", v: `YOG ${g.yog}`, cls: "" },
          { k: "Students", v: n(g.students), cls: "font-mono" },
          { k: "Online clearance", v: pct(g.total.modes.Online.clearPct), cls: cn("font-mono", TEXT.Online) },
          { k: "Offline clearance", v: pct(g.total.modes.Offline.clearPct), cls: cn("font-mono", TEXT.Offline) },
        ].map((s, i) => (
          <div key={s.k} className={cn("px-5 py-3", i > 0 && "sm:border-l", i % 2 === 1 && "border-l", i >= 2 && "border-t sm:border-t-0")}>
            <div className="eyebrow">{s.k}</div>
            <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", s.cls)}>{s.v}</div>
          </div>
        ))}
      </div>

      <ModeTable rows={g.rows} total={g.total} />
    </Card>
  );
}
