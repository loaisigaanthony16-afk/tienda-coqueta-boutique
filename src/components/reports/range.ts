import { STORE } from "@/lib/config";
import { localDateKey, type DateRange } from "@/lib/analytics";

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export interface RangeValue {
  preset: RangePreset;
  /** YYYY-MM-DD local, inclusivo. */
  from: string;
  /** YYYY-MM-DD local, inclusivo. */
  to: string;
}

export const PRESET_LABEL: Record<RangePreset, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  "7d": "7 días",
  "30d": "30 días",
  month: "Este mes",
  custom: "Personalizado",
};

export function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function presetRange(preset: RangePreset, now = new Date(), current?: RangeValue): RangeValue {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const k = localDateKey;
  switch (preset) {
    case "today":
      return { preset, from: k(today), to: k(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { preset, from: k(y), to: k(y) };
    }
    case "7d":
      return { preset, from: k(addDays(today, -6)), to: k(today) };
    case "30d":
      return { preset, from: k(addDays(today, -29)), to: k(today) };
    case "month":
      return { preset, from: k(new Date(today.getFullYear(), today.getMonth(), 1)), to: k(today) };
    case "custom":
      return { preset, from: current?.from ?? k(addDays(today, -6)), to: current?.to ?? k(today) };
  }
}

/** Convierte el rango inclusivo de días a [from, to) en ISO. */
export function toDateRange(v: RangeValue): DateRange {
  let a = parseLocalDate(v.from);
  let b = parseLocalDate(v.to);
  if (a > b) [a, b] = [b, a];
  return { from: a.toISOString(), to: addDays(b, 1).toISOString() };
}

const fmt = new Intl.DateTimeFormat(STORE.locale, { day: "numeric", month: "short", year: "numeric" });

export function rangeLabel(v: RangeValue): string {
  const a = fmt.format(parseLocalDate(v.from));
  if (v.from === v.to) return v.preset === "custom" ? a : `${PRESET_LABEL[v.preset]} · ${a}`;
  const b = fmt.format(parseLocalDate(v.to));
  return v.preset === "custom" ? `${a} – ${b}` : `${PRESET_LABEL[v.preset]} · ${a} – ${b}`;
}
