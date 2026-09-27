import { cashPortion } from "./payment";
import type { CashMovement, Cents, PaymentMethod, Sale } from "./types";

export interface RegisterSummary {
  openingAmount: Cents;
  cashSales: Cents;
  cashIn: Cents;
  cashOut: Cents;
  /** Efectivo que debería haber en gaveta. */
  expectedCash: Cents;
  byMethod: Record<PaymentMethod, Cents>;
  salesCount: number;
  voidedCount: number;
  grossSales: Cents;
  discountTotal: Cents;
  taxTotal: Cents;
}

/**
 * Arqueo de caja. Solo las ventas completadas cuentan; una venta anulada
 * devuelve su efectivo (se excluye), igual que el trigger de anulación en SQL.
 */
export function summarizeRegister(
  openingAmount: Cents,
  sales: Sale[],
  movements: CashMovement[],
): RegisterSummary {
  const completed = sales.filter((s) => s.status === "completed");
  const byMethod: Record<PaymentMethod, Cents> = { cash: 0, card: 0, transfer: 0 };
  for (const s of completed) for (const p of s.payments) byMethod[p.method] += p.amount;

  const cashSales = completed.reduce((a, s) => a + cashPortion(s.payments), 0);
  const cashIn = movements.filter((m) => m.type === "in").reduce((a, m) => a + m.amount, 0);
  const cashOut = movements.filter((m) => m.type === "out").reduce((a, m) => a + m.amount, 0);

  return {
    openingAmount,
    cashSales,
    cashIn,
    cashOut,
    expectedCash: openingAmount + cashSales + cashIn - cashOut,
    byMethod,
    salesCount: completed.length,
    voidedCount: sales.length - completed.length,
    grossSales: completed.reduce((a, s) => a + s.total, 0),
    discountTotal: completed.reduce((a, s) => a + s.discountTotal, 0),
    taxTotal: completed.reduce((a, s) => a + s.taxTotal, 0),
  };
}

export type DiscrepancyLevel = "ok" | "minor" | "major";

/** Clasifica la diferencia del arqueo. Desde $10.00 se considera mayor. */
export function classifyDifference(
  difference: Cents,
  thresholds = { major: 1000 },
): DiscrepancyLevel {
  const abs = Math.abs(difference);
  if (abs === 0) return "ok";
  return abs >= thresholds.major ? "major" : "minor";
}

/** Denominaciones para el conteo físico del arqueo (centavos). */
export const COUNT_DENOMINATIONS: Cents[] = [
  10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1,
];

export function sumCount(counts: Record<number, number>): Cents {
  return Object.entries(counts).reduce((a, [d, n]) => a + Number(d) * (n || 0), 0);
}
