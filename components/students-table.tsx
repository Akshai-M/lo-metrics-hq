"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import type { StudentRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE = 50;
const TR_ORDER = ["Below L1", "L1", "Below L2", "L2", "L3", "L4"];

type Key = "candidateId" | "yog" | "competencies" | "attempts" | "cleared" | "trLevel" | "lastAttempt" | "active";
const COLUMNS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "candidateId", label: "Candidate ID" },
  { key: "yog", label: "YOG" },
  { key: "competencies", label: "Competencies attempted" },
  { key: "attempts", label: "Total attempts", numeric: true },
  { key: "cleared", label: "Cleared competencies" },
  { key: "trLevel", label: "Latest TR level" },
  { key: "lastAttempt", label: "Last attempt" },
  { key: "active", label: "Active" },
];

function sortValue(r: StudentRow, k: Key): string | number {
  switch (k) {
    case "competencies":
      return r.competencies.length;
    case "cleared":
      return r.cleared.length;
    case "trLevel":
      return r.trLevel ? TR_ORDER.indexOf(r.trLevel) : -2;
    case "active":
      return r.active ? 1 : 0;
    default:
      return r[k];
  }
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function downloadCsv(rows: StudentRow[], clearedLabel: string) {
  const head = ["candidate_id", "yog", "competencies_attempted", "total_attempts", `cleared_competencies_${clearedLabel}`, "latest_tr_level", "latest_tr_competency", "last_attempt", "active"];
  const lines = rows.map((r) =>
    [r.candidateId, r.yog, r.competencies.join(";"), r.attempts, r.cleared.join(";"), r.trLevel ?? "", r.trLevelCompetency ?? "", r.lastAttempt, r.active ? "yes" : "no"]
      .map(csvCell)
      .join(",")
  );
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** One row per student, for the global filters. Search, sort and pages are local; CSV = the searched + sorted rows. */
export function StudentsTable({ students, clearedLabel, activeDays }: { students: StudentRow[]; clearedLabel: string; activeDays: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "lastAttempt", desc: true });
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const found = needle ? students.filter((r) => r.candidateId.toLowerCase().includes(needle)) : students;
    const dir = sort.desc ? -1 : 1;
    return [...found].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : a.candidateId.localeCompare(b.candidateId)) * dir;
    });
  }, [students, q, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * PAGE, current * PAGE + PAGE);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search candidate ID"
            placeholder="Search candidate ID"
            className="h-8 w-full bg-card pl-8 sm:w-60"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {rows.length.toLocaleString()} {rows.length === 1 ? "student" : "students"}
        </span>
        <Button variant="outline" size="sm" className="sm:ml-auto" onClick={() => downloadCsv(rows, clearedLabel)} disabled={!rows.length}>
          <Download /> Download CSV
        </Button>
      </div>

      <Table className="tabular">
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((c) => {
              const on = sort.key === c.key;
              return (
                <TableHead key={c.key} className={cn("first:pl-5 last:pr-5", c.numeric && "text-right")} aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn("-ml-2 font-medium text-muted-foreground hover:text-foreground", on && "text-foreground")}
                    onClick={() => {
                      setSort(on ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.key !== "candidateId" && c.key !== "yog" });
                      setPage(0);
                    }}
                  >
                    {c.key === "cleared" ? `${c.label} (${clearedLabel})` : c.key === "active" ? `${c.label} (${activeDays}d, assumed)` : c.label}
                    {on && (sort.desc ? <ArrowDown /> : <ArrowUp />)}
                  </Button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="px-5 py-6 text-sm text-muted-foreground">
                No students for this selection.
              </TableCell>
            </TableRow>
          ) : (
            shown.map((r) => (
              <TableRow key={r.candidateId}>
                <TableCell className="pl-5 font-mono text-xs">{r.candidateId}</TableCell>
                <TableCell>{r.yog}</TableCell>
                <TableCell className="font-mono text-xs">{r.competencies.join(", ")}</TableCell>
                <TableCell className="text-right font-mono">{r.attempts}</TableCell>
                <TableCell className={cn("font-mono text-xs", !r.cleared.length && "text-muted-foreground/60")}>{r.cleared.length ? r.cleared.join(", ") : "—"}</TableCell>
                <TableCell className={cn(!r.trLevel && "text-muted-foreground/60")}>
                  {r.trLevel ? (
                    <>
                      {r.trLevel} <span className="font-mono text-xs text-muted-foreground">{r.trLevelCompetency}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.lastAttempt}</TableCell>
                <TableCell className="pr-5">{r.active ? "Yes" : <span className="text-muted-foreground">No</span>}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2 border-t px-5 py-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          Page {current + 1} of {pages}
        </span>
        <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
