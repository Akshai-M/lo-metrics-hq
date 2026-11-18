"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Option = { value: string; label: string; href: string };

/** Segmented control that navigates (keeps state in the URL). */
export function SegmentedNav({ value, options, label }: { value: string; options: Option[]; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v: string[]) => {
        const next = options.find((o) => o.value === v[0]);
        if (next && next.value !== value) start(() => router.push(next.href, { scroll: false }));
      }}
      spacing={0}
      className="rounded-md border bg-muted/60 p-0.5 data-[pending=true]:opacity-70"
      data-pending={pending}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          size="sm"
          className="rounded-[5px]! border-0! px-3 text-muted-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-sm aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Labelled dropdown that navigates. */
export function SelectNav({ value, options, label }: { value: string; options: Option[]; label: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow">{label}</span>
      <Select
        value={value}
        items={options.map((o) => ({ value: o.value, label: o.label }))}
        onValueChange={(v) => {
          const next = options.find((o) => o.value === v);
          if (next && next.value !== value) start(() => router.push(next.href, { scroll: false }));
        }}
      >
        <SelectTrigger className="min-w-44 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type MultiOption = { value: string; label: string; short?: string; disabled?: boolean; hint?: string };

/**
 * Dropdown of checkboxes. Calls onChange with the new selection (in option order).
 * The last checked box can't be unchecked.
 */
export function MultiSelect({
  label,
  options,
  selected,
  allLabel,
  onChange,
  pending,
}: {
  label: string;
  options: MultiOption[];
  selected: string[];
  allLabel: string;
  onChange: (next: string[]) => void;
  pending?: boolean;
}) {
  // Local copy so ticks show at once; re-synced when the URL (props) changes.
  const [sel, setSel] = useState(selected);
  const [prev, setPrev] = useState(selected.join());
  if (prev !== selected.join()) {
    setPrev(selected.join());
    setSel(selected);
  }
  const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
  const all = enabled.every((v) => sel.includes(v));

  function apply(next: string[]) {
    setSel(next);
    onChange(next);
  }
  const toggle = (value: string, on: boolean) =>
    apply(options.map((o) => o.value).filter((v) => (v === value ? on : sel.includes(v))));

  const summary = all ? allLabel : options.filter((o) => sel.includes(o.value)).map((o) => o.short ?? o.label).join(", ");

  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 w-full max-w-64 min-w-36 items-center justify-between gap-1.5 rounded-lg border border-input bg-card py-2 pr-2 pl-2.5 text-sm whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[pending=true]:opacity-70"
          data-pending={pending}
        >
          <span className="truncate">{summary}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-(--anchor-width)">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={all} closeOnClick={false} onClick={() => apply(enabled)}>
              Select all
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {options.map((o) => {
              const on = sel.includes(o.value);
              return (
                <DropdownMenuCheckboxItem
                  key={o.value}
                  checked={on}
                  disabled={o.disabled || (on && sel.length === 1)}
                  onCheckedChange={(v) => toggle(o.value, v)}
                >
                  {o.label}
                  {o.hint && <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
