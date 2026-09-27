"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { PRESET_LABEL, presetRange, type RangePreset, type RangeValue } from "./range";

const ALL: RangePreset[] = ["today", "yesterday", "7d", "30d", "month", "custom"];

export function RangePicker({
  value,
  onChange,
  presets = ALL,
  className,
}: {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
  presets?: RangePreset[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ToggleGroup
        type="single"
        value={value.preset}
        onValueChange={(p) => p && onChange(presetRange(p as RangePreset, new Date(), value))}
        aria-label="Periodo"
      >
        {presets.map((p) => (
          <ToggleGroupItem key={p} value={p} className="h-8 px-2.5 text-xs sm:text-sm">
            {PRESET_LABEL[p]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Desde"
            className="h-8 w-[9.5rem]"
            value={value.from}
            max={value.to}
            onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            aria-label="Hasta"
            className="h-8 w-[9.5rem]"
            value={value.to}
            min={value.from}
            onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
