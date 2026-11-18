"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import type { FilterOptions, Filters } from "@/lib/api";
import { MultiSelect } from "@/components/filters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

/**
 * Filter bar shared by every tab. All state is in the URL; the server applies it
 * (lib/metrics/filters.ts) to every KPI, chart and table.
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
  const hasFilters = FILTER_PARAMS.some((k) => new URLSearchParams(query).has(k));

  return (
    <section
      aria-label="Filters"
      className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border bg-card px-4 py-3 data-[pending=true]:opacity-80"
      data-pending={pending}
    >
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Program</span>
        <Select value="YFT" items={PROGRAMS}>
          <SelectTrigger className="min-w-36 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROGRAMS.map((p) => (
              <SelectItem key={p.value} value={p.value} disabled={p.value === "IRP"}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      <div className="flex flex-col gap-1">
        <span className="eyebrow">Date range</span>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="From"
            className="h-8 w-36 bg-card"
            value={f.from ?? ""}
            min={options.minDay ?? undefined}
            max={f.to ?? options.maxDay ?? undefined}
            onChange={(e) => set({ from: e.target.value || null })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            className="h-8 w-36 bg-card"
            value={f.to ?? ""}
            min={f.from ?? options.minDay ?? undefined}
            max={options.maxDay ?? undefined}
            onChange={(e) => set({ to: e.target.value || null })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="eyebrow">Attempt type</span>
        <ToggleGroup
          aria-label="Attempt type"
          value={[f.attempt]}
          onValueChange={(v: string[]) => v[0] && v[0] !== f.attempt && set({ attempt: v[0] === "all" ? null : v[0] })}
          spacing={0}
          className="rounded-md border bg-muted/60 p-0.5"
        >
          {ATTEMPTS.map((a) => (
            <ToggleGroupItem
              key={a.value}
              value={a.value}
              size="sm"
              className="rounded-[5px]! border-0! px-2.5 text-muted-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-sm aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
            >
              {a.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <Toggle
          id="f-online"
          label="Include online data"
          checked={f.online}
          onChange={(on) => {
            // On: a full Offline + TR choice becomes all three modes. Off: Online leaves the mode choice.
            if (on) set({ online: "1", modes: f.modes.length === 2 ? null : f.modes.join(",") });
            else set({ online: null, modes: list(f.modes.filter((m) => m !== "Online"), ["Offline", "TR"]) });
          }}
        />
        <Toggle id="f-unev" label="Include unevaluable attempts" checked={f.unevaluable} onChange={(on) => set({ unev: on ? "1" : null })} />
        <Toggle
          id="f-active"
          label={`Active students only (assumed: any attempt in the last ${options.activeDays} days)`}
          checked={f.active}
          onChange={(on) => set({ active: on ? "1" : null })}
        />
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() => set(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])))}
          className="ml-auto flex h-8 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <RotateCcw className="size-3.5" /> Reset filters
        </button>
      )}
    </section>
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
