"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipPreset {
  label: string;
  values: string[];
}

/**
 * Campo de "chips": Enter, coma o Tab agregan; Backspace en vacío quita el
 * último. Pegar "S, M, L" agrega varios. `format` normaliza cada valor.
 */
export function ChipsInput({
  value,
  onChange,
  placeholder,
  presets,
  presetMode = "replace",
  format = (s) => s.trim(),
  sort,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  presets?: ChipPreset[];
  /** "replace" sustituye la lista; "add" agrega sin duplicar. */
  presetMode?: "replace" | "add";
  format?: (s: string) => string;
  sort?: (list: string[]) => string[];
  id?: string;
}) {
  const [text, setText] = React.useState("");

  const add = (raw: string[]) => {
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const r of raw) {
      const v = format(r);
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      next.push(v);
    }
    if (next.length !== value.length) onChange(sort ? sort(next) : next);
  };
  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  const commit = () => {
    if (!text.trim()) return false;
    add(text.split(/[,;\n]/));
    setText("");
    return true;
  };

  return (
    <div className="grid gap-2">
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      >
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-secondary pr-1 pl-2 text-xs font-medium text-secondary-foreground"
          >
            {v}
            <button
              type="button"
              className="grid size-4 place-items-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={() => remove(v)}
              aria-label={`Quitar ${v}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const t = e.target.value;
            if (/[,;]/.test(t)) {
              add(t.split(/[,;]/).slice(0, -1));
              setText(t.split(/[,;]/).pop() ?? "");
            } else setText(t);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || (e.key === "Tab" && text.trim())) {
              if (commit()) e.preventDefault();
              else if (e.key === "Enter") e.preventDefault();
            } else if (e.key === "Backspace" && !text && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={commit}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-24 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => (presetMode === "replace" ? onChange(sort ? sort(p.values) : p.values) : add(p.values))}
              className={cn(
                "h-7 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
