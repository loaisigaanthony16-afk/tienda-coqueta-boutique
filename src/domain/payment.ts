import type { Cents, Payment, PaymentMethod } from "./types";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

/** Lo que entrega el cajero en el modal de cobro. */
export interface TenderInput {
  method: PaymentMethod;
  /** Para efectivo: lo recibido. Para tarjeta/transferencia: lo cobrado. */
  amount: Cents;
  reference?: string;
}

export type SettleResult =
  | { ok: true; payments: Payment[]; change: Cents; paid: Cents }
  | { ok: false; error: string; missing: Cents };

/**
 * Convierte lo recibido en pagos aplicados a la venta.
 * Reglas:
 *  - Tarjeta y transferencia nunca pueden exceder lo pendiente (no dan vuelto).
 *  - Solo el efectivo puede sobrepasar el total; el excedente es el vuelto.
 *  - Los pagos no-efectivo se aplican primero y el efectivo cubre el resto.
 */
export function settle(total: Cents, tenders: TenderInput[]): SettleResult {
  const valid = tenders.filter((t) => t.amount > 0);
  if (total <= 0) return { ok: true, payments: [], change: 0, paid: 0 };

  const nonCash = valid.filter((t) => t.method !== "cash");
  const cash = valid.filter((t) => t.method === "cash");
  const nonCashSum = nonCash.reduce((a, t) => a + t.amount, 0);
  if (nonCashSum > total) {
    return {
      ok: false,
      error: "Tarjeta/transferencia no puede superar el total: no generan vuelto.",
      missing: 0,
    };
  }
  const cashTendered = cash.reduce((a, t) => a + t.amount, 0);
  const pending = total - nonCashSum;
  if (cashTendered < pending) {
    return { ok: false, error: "Monto insuficiente.", missing: pending - cashTendered };
  }

  const payments: Payment[] = nonCash.map((t) => ({
    method: t.method,
    amount: t.amount,
    reference: t.reference?.trim() || undefined,
  }));
  if (pending > 0) {
    payments.push({ method: "cash", amount: pending, tendered: cashTendered });
  }
  return { ok: true, payments, change: cashTendered - pending, paid: total };
}

/** Sugerencias de billetes para cobrar rápido: exacto + siguientes redondeos. */
export function quickCashOptions(total: Cents, denominations: readonly Cents[]): Cents[] {
  if (total <= 0) return [];
  const out = new Set<Cents>([total]);
  for (const d of denominations) {
    const rounded = Math.ceil(total / d) * d;
    if (rounded > total) out.add(rounded);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

export function cashPortion(payments: Payment[]): Cents {
  return payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
}
