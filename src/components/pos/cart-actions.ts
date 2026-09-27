"use client";
import { toast } from "sonner";
import type { VariantView } from "@/domain/types";
import { variantLabel } from "@/lib/format";
import { useCart } from "@/stores/cart";
import { useCatalog } from "@/stores/catalog";
import { beepError, beepOk } from "./beep";

/**
 * Acciones del carrito con validación de stock. Leen los stores con
 * getState() para no suscribir componentes a cambios que no pintan.
 */

function describe(v: VariantView) {
  const label = variantLabel(v);
  return label ? `${v.productName} (${label})` : v.productName;
}

/** Agrega una unidad respetando el stock. Devuelve true si se agregó. */
export function addToCart(v: VariantView, opts: { sound?: boolean } = {}): boolean {
  if (!v.active) {
    if (opts.sound) beepError();
    toast.error(`${describe(v)} está inactivo.`);
    return false;
  }
  const inCart = useCart.getState().lines.find((l) => l.variantId === v.id)?.quantity ?? 0;
  if (inCart + 1 > v.stock) {
    if (opts.sound) beepError();
    toast.warning(
      v.stock <= 0 ? `Sin stock: ${describe(v)}` : `Solo hay ${v.stock} de ${describe(v)} en inventario.`,
    );
    return false;
  }
  useCart.getState().add(v.id, 1);
  if (opts.sound) beepOk();
  return true;
}

/** Busca por código exacto (barcode o SKU) y agrega. */
export function addByCode(code: string, opts: { sound?: boolean } = {}): boolean {
  const v = useCatalog.getState().findByCode(code);
  if (!v) {
    if (opts.sound) beepError();
    toast.error(`Código no encontrado: ${code}`);
    return false;
  }
  return addToCart(v, opts);
}

/** Fija la cantidad de una línea; limita al stock disponible y avisa. */
export function setLineQuantity(variantId: string, qty: number) {
  const v = useCatalog.getState().byId.get(variantId);
  let next = Math.max(0, Math.trunc(Number.isFinite(qty) ? qty : 0));
  if (v && next > v.stock) {
    toast.warning(`Solo hay ${v.stock} de ${describe(v)} en inventario.`);
    next = v.stock;
  }
  useCart.getState().setQuantity(variantId, next);
}

/** Id de la última línea tocada (o la última del carrito). */
export function lastLineId(): string | null {
  const { lines, lastVariantId } = useCart.getState();
  if (lastVariantId && lines.some((l) => l.variantId === lastVariantId)) return lastVariantId;
  return lines.at(-1)?.variantId ?? null;
}

export function bumpLastLine(delta: number) {
  const id = lastLineId();
  if (!id) return;
  const line = useCart.getState().lines.find((l) => l.variantId === id);
  if (!line) return;
  setLineQuantity(id, line.quantity + delta);
}

export function removeLastLine() {
  const id = lastLineId();
  if (id) useCart.getState().remove(id);
}
