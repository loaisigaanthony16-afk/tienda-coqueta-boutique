import type { InventoryMovementType, ProductVariant } from "@/domain/types";

export type StockStatus = "ok" | "low" | "out";

export function stockStatus(v: Pick<ProductVariant, "stock" | "minStock">): StockStatus {
  if (v.stock <= 0) return "out";
  if (v.stock <= v.minStock) return "low";
  return "ok";
}

export const STOCK_TEXT: Record<StockStatus, string> = {
  ok: "",
  low: "text-warning font-semibold",
  out: "text-destructive font-semibold",
};

export const MOVEMENT_LABEL: Record<InventoryMovementType, string> = {
  sale: "Venta",
  void: "Anulación",
  purchase: "Compra / entrada",
  adjustment: "Ajuste",
  return: "Devolución",
  initial: "Inventario inicial",
};

/** Minúsculas y sin tildes, para búsquedas tolerantes. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function variantKey(size: string | null, color: string | null): string {
  return `${size ?? ""}\u0001${color ?? ""}`;
}
