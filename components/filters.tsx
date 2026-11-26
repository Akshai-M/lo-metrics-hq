"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";

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
  allowEmpty = false,
}: {
  label: string;
  options: MultiOption[];
  selected: string[];
  allLabel: string;
  onChange: (next: string[]) => void;
  pending?: boolean;
  /** Lets every option be unticked (adds a Clear item); off by default so a filter always has one choice. */
  allowEmpty?: boolean;
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

  const summary = all ? allLabel : sel.length === 0 ? "None" : options.filter((o) => sel.includes(o.value)).map((o) => o.short ?? o.label).join(", ");

  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="w-full min-w-36 justify-between bg-card pr-2 pl-2.5 font-normal data-[pending=true]:opacity-70 lg:max-w-64"
              data-pending={pending}
            />
          }
        >
          <span className="truncate">{summary}</span>
          <ChevronDownIcon className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto max-w-[calc(100vw-2rem)] min-w-(--anchor-width)">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={all} closeOnClick={false} onClick={() => apply(enabled)}>
              Select all
            </DropdownMenuItem>
            {allowEmpty && (
              <DropdownMenuItem disabled={sel.length === 0} closeOnClick={false} onClick={() => apply([])}>
                Clear
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {options.map((o) => {
              const on = sel.includes(o.value);
              return (
                <DropdownMenuCheckboxItem
                  key={o.value}
                  checked={on}
                  disabled={o.disabled || (!allowEmpty && on && sel.length === 1)}
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
