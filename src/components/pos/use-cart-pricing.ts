"use client";
import * as React from "react";
import { priceCart, type PricingResult } from "@/domain/pricing";
import type { VariantView } from "@/domain/types";
import { useCart, type CartLine } from "@/stores/cart";
import { useCatalog } from "@/stores/catalog";

export interface CartRow {
  line: CartLine;
  view: VariantView | undefined;
}

export interface CartPricing {
  rows: CartRow[];
  pricing: PricingResult;
}

/** Precio del carrito con los precios del catálogo local (el servidor recalcula). */
export function useCartPricing(): CartPricing {
  const lines = useCart((s) => s.lines);
  const cartDiscount = useCart((s) => s.cartDiscount);
  const byId = useCatalog((s) => s.byId);
  return React.useMemo(() => {
    const rows = lines.map((line) => ({ line, view: byId.get(line.variantId) }));
    const pricing = priceCart(
      rows.map(({ line, view }) => ({
        key: line.variantId,
        quantity: line.quantity,
        unitPrice: view?.effectivePrice ?? 0,
        unitCost: view?.effectiveCost ?? 0,
        discount: line.discount,
      })),
      cartDiscount,
    );
    return { rows, pricing };
  }, [lines, cartDiscount, byId]);
}

/** Solo total + artículos, para la barra móvil. */
export function useCartTotals() {
  const { pricing } = useCartPricing();
  return { total: pricing.total, itemCount: pricing.itemCount };
}
