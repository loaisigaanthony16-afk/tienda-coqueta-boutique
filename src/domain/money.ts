import { STORE } from "@/lib/config";
import type { Cents } from "./types";

/**
 * Motor de dinero. Todo se maneja en centavos enteros.
 * El redondeo es "mitad lejos de cero", igual que round() de PostgreSQL
 * sobre numeric, para que cliente y base de datos cuadren al centavo.
 */

export function roundHalfAwayFromZero(value: number): number {
  const r = Math.round(Math.abs(value) + Number.EPSILON * Math.abs(value));
  return value < 0 ? -r : r;
}

/** Convierte "12.50", "12,50" o 12.5 a 1250. Devuelve NaN si es inválido. */
export function toCents(input: string | number): Cents {
  if (typeof input === "number") {
    return Number.isFinite(input) ? roundHalfAwayFromZero(input * 100) : NaN;
  }
  const clean = input.trim().replace(/\s/g, "").replace(/[$]/g, "");
  if (!clean) return NaN;
  // Acepta coma o punto decimal; los separadores de miles se descartan.
  const normalized = /,\d{1,2}$/.test(clean)
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean.replace(/,/g, "");
  if (!/^-?\d*\.?\d*$/.test(normalized) || normalized === "." || normalized === "-") return NaN;
  const [whole, frac = ""] = normalized.replace("-", "").split(".");
  const sign = normalized.startsWith("-") ? -1 : 1;
  const cents =
    Number(whole || "0") * 100 +
    Number((frac + "00").slice(0, 2)) +
    (frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0);
  return sign * cents;
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

const formatter = new Intl.NumberFormat(STORE.locale, {
  style: "currency",
  currency: STORE.currency,
  minimumFractionDigits: 2,
});

export function formatMoney(cents: Cents): string {
  return formatter.format(cents / 100);
}

/** Formato plano sin símbolo, para tickets y exportaciones: "1,234.50". */
export function formatPlain(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${(abs % 100).toString().padStart(2, "0")}`;
}

/** Porcentaje en puntos básicos (1500 = 15%) de un monto. */
export function percentOf(cents: Cents, bps: number): Cents {
  return roundHalfAwayFromZero((cents * bps) / 10000);
}

/** IVA contenido en un monto que ya lo incluye. */
export function taxIncluded(grossCents: Cents, bps: number): Cents {
  const net = roundHalfAwayFromZero((grossCents * 10000) / (10000 + bps));
  return grossCents - net;
}

/** IVA a sumar sobre un monto neto. */
export function taxExcluded(netCents: Cents, bps: number): Cents {
  return percentOf(netCents, bps);
}

/**
 * Reparte `total` proporcionalmente a `weights` sin perder centavos
 * (método del mayor residuo). La suma del resultado es exactamente `total`.
 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    floors[order[k].i] += 1;
  }
  return floors;
}

export function marginBps(price: Cents, cost: Cents): number {
  if (price <= 0) return 0;
  return roundHalfAwayFromZero(((price - cost) * 10000) / price);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
