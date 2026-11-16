"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
