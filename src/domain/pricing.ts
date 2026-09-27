import { STORE } from "@/lib/config";
import { allocate, percentOf, taxExcluded, taxIncluded } from "./money";
import type { Cents, Discount } from "./types";

export interface PricingLineInput {
  key: string;
  quantity: number;
  unitPrice: Cents;
  unitCost: Cents;
  discount?: Discount | null;
}

export interface PricedLine {
  key: string;
  quantity: number;
  unitPrice: Cents;
  unitCost: Cents;
  gross: Cents;
  /** Descuento propio de la línea. */
  lineDiscount: Cents;
  /** Parte del descuento global prorrateada a esta línea. */
  cartDiscountShare: Cents;
  /** Descuento total (línea + prorrateo). */
  discount: Cents;
  lineTotal: Cents;
  tax: Cents;
  cost: Cents;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotal: Cents;
  discountTotal: Cents;
  taxTotal: Cents;
  total: Cents;
  costTotal: Cents;
  itemCount: number;
}

export function resolveDiscount(base: Cents, d: Discount | null | undefined): Cents {
  if (!d || base <= 0) return 0;
  const raw = d.kind === "percent" ? percentOf(base, clamp(d.bps, 0, 10000)) : d.cents;
  return clamp(raw, 0, base);
}

/**
 * Calcula el carrito completo. El descuento global se prorratea entre las
 * líneas según su monto neto, así cada sale_item guarda su descuento real y
 * los reportes de margen por producto cuadran con el total.
 */
export function priceCart(
  inputs: PricingLineInput[],
  cartDiscount: Discount | null = null,
  opts: { taxRateBps?: number; pricesIncludeTax?: boolean } = {},
): PricingResult {
  const bps = opts.taxRateBps ?? STORE.taxRateBps;
  const inclusive = opts.pricesIncludeTax ?? STORE.pricesIncludeTax;

  const stage1 = inputs.map((l) => {
    const quantity = Math.max(0, Math.trunc(l.quantity));
    const gross = quantity * l.unitPrice;
    const lineDiscount = resolveDiscount(gross, l.discount);
    return { l, quantity, gross, lineDiscount, net: gross - lineDiscount };
  });

  const netSum = stage1.reduce((a, s) => a + s.net, 0);
  const cartDiscountTotal = resolveDiscount(netSum, cartDiscount);
  const shares = allocate(
    cartDiscountTotal,
    stage1.map((s) => s.net),
  );

  const lines: PricedLine[] = stage1.map((s, i) => {
    const cartDiscountShare = shares[i] ?? 0;
    const discount = s.lineDiscount + cartDiscountShare;
    const afterDiscount = s.gross - discount;
    const tax = inclusive ? taxIncluded(afterDiscount, bps) : taxExcluded(afterDiscount, bps);
    const lineTotal = inclusive ? afterDiscount : afterDiscount + tax;
    return {
      key: s.l.key,
      quantity: s.quantity,
      unitPrice: s.l.unitPrice,
      unitCost: s.l.unitCost,
      gross: s.gross,
      lineDiscount: s.lineDiscount,
      cartDiscountShare,
      discount,
      lineTotal,
      tax,
      cost: s.quantity * s.l.unitCost,
    };
  });

  const sum = (f: (l: PricedLine) => number) => lines.reduce((a, l) => a + f(l), 0);
  return {
    lines,
    subtotal: sum((l) => l.gross),
    discountTotal: sum((l) => l.discount),
    taxTotal: sum((l) => l.tax),
    total: sum((l) => l.lineTotal),
    costTotal: sum((l) => l.cost),
    itemCount: sum((l) => l.quantity),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
