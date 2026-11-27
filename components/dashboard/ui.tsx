"use client";

import { CalendarDays, type LucideIcon } from "lucide-react";
import { TABS, type Tab } from "@/lib/tabs";
import { cn } from "@/lib/utils";

export const DESCRIPTIONS: Record<Tab, string> = {
  overview: "Students attempting and clearing FT competency assessments, across all competencies, cohorts and dates.",
  splits: "Attempted and qualified students by competency, mode and period.",
  yog: "Clearance by mode, overall and by year of graduation.",
  competency: "Clearance and reattempts by competency and by assessment mode, and why attempts fail.",
  reattempts: "How many attempts students need to clear, and how long it takes.",
  outcomes: "From the assessed pool to placement, and how technical rounds turn out.",
  students: "One row per student for the current filters. Search, sort and download.",
  health: "Where the numbers come from: the latest run, exam events read, and attempts that could not be evaluated.",
};

/** Greyed card for a metric whose source data doesn't exist yet. */
export function PendingKpi({ label, needs }: { label: string; needs: string }) {
  return (
    <div className="flex flex-col gap-3 bg-muted/40 p-5 text-muted-foreground">
      <span className="text-sm">{label}</span>
      <div className="font-serif text-3xl text-muted-foreground/50">—</div>
      <span className="w-fit rounded border border-dashed px-1.5 py-0.5 text-xs">{needs}</span>
    </div>
  );
}

const CHIP = {
  green: "bg-chip-green text-primary",
  blue: "bg-chip-blue text-online-text",
  amber: "bg-chip-amber text-offline-text",
};

export function Kpi({ label, value, sub, icon: Icon, chip }: { label: string; value: string; sub: string; icon: LucideIcon; chip: keyof typeof CHIP }) {
  return (
    <div className="flex flex-col gap-3 bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", CHIP[chip])}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="font-serif text-3xl tabular-nums sm:text-4xl">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function Hero({ tab: key, runAt, controls }: { tab: Tab; runAt?: string; controls?: React.ReactNode }) {
  const idx = TABS.findIndex((t) => t.key === key);
  const tab = TABS[idx];
  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="eyebrow flex items-center gap-3">
          <span className="h-px w-5 bg-primary" />
          {tab.eyebrow} <span className="text-primary">/ {String(idx + 1).padStart(2, "0")}</span>
        </div>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">{tab.title ?? tab.label}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{DESCRIPTIONS[key]}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        {runAt && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            Latest run · {new Date(runAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
        {controls}
      </div>
    </section>
  );
}
