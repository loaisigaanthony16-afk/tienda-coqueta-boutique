"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Discount } from "@/domain/types";

export interface CartLine {
  variantId: string;
  quantity: number;
  discount: Discount | null;
}

interface CartState {
  lines: CartLine[];
  cartDiscount: Discount | null;
  customerName: string;
  /** Última línea tocada, para resaltarla en la UI. */
  lastVariantId: string | null;
  add(variantId: string, qty?: number): void;
  setQuantity(variantId: string, qty: number): void;
  setLineDiscount(variantId: string, d: Discount | null): void;
  remove(variantId: string): void;
  setCartDiscount(d: Discount | null): void;
  setCustomerName(name: string): void;
  clear(): void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      cartDiscount: null,
      customerName: "",
      lastVariantId: null,
      add: (variantId, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.variantId === variantId);
          const lines = existing
            ? s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + qty } : l))
            : [...s.lines, { variantId, quantity: qty, discount: null }];
          return { lines, lastVariantId: variantId };
        }),
      setQuantity: (variantId, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.variantId !== variantId)
              : s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.trunc(qty) } : l)),
          lastVariantId: variantId,
        })),
      setLineDiscount: (variantId, discount) =>
        set((s) => ({ lines: s.lines.map((l) => (l.variantId === variantId ? { ...l, discount } : l)) })),
      remove: (variantId) => set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
      setCartDiscount: (cartDiscount) => set({ cartDiscount }),
      setCustomerName: (customerName) => set({ customerName }),
      clear: () => set({ lines: [], cartDiscount: null, customerName: "", lastVariantId: null }),
    }),
    { name: "coqueta.cart", storage: createJSONStorage(() => localStorage) },
  ),
);
