"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { FilterOptions, Filters } from "@/lib/api";
import { MultiSelect } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const MODE_LABEL: Record<string, string> = { Online: "Online", Offline: "Offline", TR: "Technical round (TR)" };
const ATTEMPTS = [
  { value: "all", label: "All" },
  { value: "first", label: "First attempt" },
  { value: "re", label: "Reattempt" },
];
const PROGRAMS = [
  { value: "YFT", label: "YFT (competency assessments)" },
  { value: "IRP", label: "IRP (internships) · coming soon" },
];
const FILTER_PARAMS = ["comps", "yogs", "modes", "online", "from", "to", "attempt", "unev", "active"];

const day = (d: Date) => format(d, "yyyy-MM-dd");
const show = (d: string) => format(parseISO(d), "d MMM yyyy");

/**
 * Filter bar shared by every tab. All state is in the URL; the server applies it
 * (lib/metrics/filters.ts) to every KPI, chart and table. Inline on large screens,
 * in a sheet behind a "Filters" button on smaller ones.
 */
export function GlobalFilters({
  query,
  filters: f,
  options,
  compNames,
}: {
  query: string; // current search params, without "?"
  filters: Filters;
  options: FilterOptions;
  compNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(updates: Record<string, string | null>) {
    const params = new URLSearchParams(query);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const q = params.toString();
    start(() => router.push(q ? `/?${q}` : "/", { scroll: false }));
  }
  // A full selection is the default, so it is dropped from the URL.
  const list = (next: string[], all: string[]) => (all.every((v) => next.includes(v)) ? null : next.join(","));
  const allowedModes = options.modes.filter((m) => f.online || m !== "Online");
  const active = FILTER_PARAMS.filter((k) => new URLSearchParams(query).has(k)).length;
  const reset = () => set(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])));

  // Rendered once inline (large screens) and once in the sheet (small screens); p keeps ids unique.
  const controls = (p: string) => (
    <>
      <Field label="Program">
        <Select value="YFT" items={PROGRAMS}>
          <SelectTrigger className="w-full bg-card lg:w-auto lg:min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width) max-w-[calc(100vw-2rem)]">
            {PROGRAMS.map((p) => (
              <SelectItem key={p.value} value={p.value} disabled={p.value === "IRP"}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <MultiSelect
        label="Competency"
        allLabel="All competencies"
        selected={f.comps}
        options={options.competencies.map((c) => ({ value: c, label: `${c} ${compNames[c] ?? ""}`, short: c }))}
        onChange={(next) => set({ comps: list(next, options.competencies) })}
        pending={pending}
      />
      <MultiSelect
        label="YOG"
        allLabel="All cohorts"
        selected={f.yogs}
        options={options.yogs.map((y) => ({ value: y, label: y }))}
        onChange={(next) => set({ yogs: list(next, options.yogs) })}
        pending={pending}
      />
      <MultiSelect
        label="Mode"
        allLabel={f.online ? "All modes" : "Offline + TR"}
        selected={f.modes}
        options={options.modes.map((m) => ({
          value: m,
          label: MODE_LABEL[m] ?? m,
          short: m,
          disabled: m === "Online" && !f.online,
          hint: m === "Online" && !f.online ? "turn on “Include online”" : undefined,
        }))}
        onChange={(next) => set({ modes: list(next, allowedModes) })}
        pending={pending}
      />

      <Field label="Date range">
        <DateRangePicker
          from={f.from}
          to={f.to}
          min={options.minDay}
          max={options.maxDay}
          onApply={(from, to) => set({ from, to })}
        />
      </Field>

      <Field label="Attempt type">
        <ToggleGroup
          aria-label="Attempt type"
          value={[f.attempt]}
          onValueChange={(v: string[]) => v[0] && v[0] !== f.attempt && set({ attempt: v[0] === "all" ? null : v[0] })}
          spacing={0}
          className="w-full rounded-md border bg-muted/60 p-0.5 lg:w-auto"
        >
          {ATTEMPTS.map((a) => (
            <ToggleGroupItem
              key={a.value}
              value={a.value}
              size="sm"
              className="flex-1 rounded-[5px]! border-0! px-2.5 text-muted-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-sm aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm lg:flex-none"
            >
              {a.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <div className="flex flex-col gap-2 lg:gap-1.5">
        <Toggle
          id={`${p}-online`}
          label="Include online data"
          checked={f.online}
          onChange={(on) => {
            // On: a full Offline + TR choice becomes all three modes. Off: Online leaves the mode choice.
            if (on) set({ online: "1", modes: f.modes.length === 2 ? null : f.modes.join(",") });
            else set({ online: null, modes: list(f.modes.filter((m) => m !== "Online"), ["Offline", "TR"]) });
          }}
        />
        <Toggle id={`${p}-unev`} label="Include unevaluable attempts" checked={f.unevaluable} onChange={(on) => set({ unev: on ? "1" : null })} />
        <Toggle
          id={`${p}-active`}
          label={`Active students only (assumed: any attempt in the last ${options.activeDays} days)`}
          checked={f.active}
          onChange={(on) => set({ active: on ? "1" : null })}
        />
      </div>
    </>
  );

  return (
    <section aria-label="Filters" className="rounded-lg border bg-card px-3 py-2.5 lg:px-4 lg:py-3">
      {/* Small screens: a button that opens the filters in a sheet. */}
      <div className="flex items-center gap-2 lg:hidden">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            <SlidersHorizontal /> Filters{active > 0 && ` (${active})`}
          </SheetTrigger>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Every number on every tab follows these.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              {controls("sheet")}
              {active > 0 && (
                <Button variant="outline" onClick={reset}>
                  <RotateCcw /> Reset filters
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {f.modes.join(" + ")} · {f.comps.length === options.competencies.length ? "all competencies" : f.comps.join(", ")}
        </span>
        {pending && <Spinner className="ml-auto shrink-0 text-muted-foreground" />}
      </div>

      {/* Large screens: inline. */}
      <div className="hidden flex-wrap items-end gap-x-5 gap-y-3 lg:flex">
        {controls("bar")}
        <div className="ml-auto flex items-center gap-2 self-center">
          {pending && <Spinner className="text-muted-foreground" />}
          {active > 0 && (
            <Button variant="link" size="sm" onClick={reset}>
              <RotateCcw /> Reset filters
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

/** Date range in a popover calendar; applied to the URL with "Apply". */
function DateRangePicker({
  from,
  to,
  min,
  max,
  onApply,
}: {
  from: string | null;
  to: string | null;
  min: string | null;
  max: string | null;
  onApply: (from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const current: DateRange | undefined = from || to ? { from: from ? parseISO(from) : undefined, to: to ? parseISO(to) : undefined } : undefined;
  const label = from || to ? `${from ? show(from) : "Start"} – ${to ? show(to) : "Latest"}` : "All dates";
  const disabled = [...(min ? [{ before: parseISO(min) }] : []), ...(max ? [{ after: parseISO(max) }] : [])];

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRange(current);
      }}
    >
      <PopoverTrigger render={<Button variant="outline" className="w-full justify-start bg-card font-normal lg:w-auto" />}>
        <CalendarIcon className="text-muted-foreground" />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          defaultMonth={range?.from ?? (max ? parseISO(max) : undefined)}
          numberOfMonths={1}
          disabled={disabled}
        />
        <div className="flex items-center justify-end gap-2 border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onApply(null, null);
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            disabled={!range?.from}
            onClick={() => {
              onApply(range?.from ? day(range.from) : null, range?.to ? day(range.to) : range?.from ? day(range.from) : null);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} size="sm" checked={checked} onCheckedChange={(v) => onChange(v)} />
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
    </div>
  );
}
