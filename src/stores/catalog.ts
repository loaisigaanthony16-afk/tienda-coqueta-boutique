"use client";
import { create } from "zustand";
import type { Category, Product, ProductVariant, VariantView } from "@/domain/types";
import { repo } from "@/data";

interface CatalogState {
  loaded: boolean;
  categories: Category[];
  products: Product[];
  variants: ProductVariant[];
  /** Variantes con datos de producto resueltos. */
  views: VariantView[];
  byCode: Map<string, VariantView>;
  byId: Map<string, VariantView>;
  load(force?: boolean): Promise<void>;
  /** Busca por código de barras o SKU exacto (sin distinguir mayúsculas). */
  findByCode(code: string): VariantView | undefined;
  /** Actualiza el stock local sin recargar todo (tras una venta). */
  patchStock(changes: Array<{ variantId: string; stock: number }>): void;
}

export function buildViews(products: Product[], variants: ProductVariant[]): VariantView[] {
  const pById = new Map(products.map((p) => [p.id, p]));
  return variants.flatMap((v) => {
    const p = pById.get(v.productId);
    if (!p) return [];
    return [{
      ...v,
      productName: p.name,
      brand: p.brand,
      categoryId: p.categoryId,
      effectivePrice: v.price ?? p.basePrice,
      effectiveCost: v.cost ?? p.baseCost,
      imageUrl: p.imageUrl,
      active: v.active && p.active,
    }];
  });
}

function index(views: VariantView[]) {
  const byCode = new Map<string, VariantView>();
  const byId = new Map<string, VariantView>();
  for (const v of views) {
    byId.set(v.id, v);
    byCode.set(v.barcode.toUpperCase(), v);
    byCode.set(v.sku.toUpperCase(), v);
  }
  return { byCode, byId };
}

let inflight: Promise<void> | null = null;

export const useCatalog = create<CatalogState>((set, get) => ({
  loaded: false,
  categories: [],
  products: [],
  variants: [],
  views: [],
  byCode: new Map(),
  byId: new Map(),
  async load(force = false) {
    if (get().loaded && !force) return;
    if (inflight) return inflight;
    inflight = (async () => {
      const r = repo();
      const [categories, products, variants] = await Promise.all([
        r.listCategories(), r.listProducts(), r.listVariants(),
      ]);
      const views = buildViews(products, variants);
      set({ loaded: true, categories, products, variants, views, ...index(views) });
    })().finally(() => (inflight = null));
    return inflight;
  },
  findByCode(code) {
    return get().byCode.get(code.trim().toUpperCase());
  },
  patchStock(changes) {
    const map = new Map(changes.map((c) => [c.variantId, c.stock]));
    const variants = get().variants.map((v) => (map.has(v.id) ? { ...v, stock: map.get(v.id)! } : v));
    const views = buildViews(get().products, variants);
    set({ variants, views, ...index(views) });
  },
}));
