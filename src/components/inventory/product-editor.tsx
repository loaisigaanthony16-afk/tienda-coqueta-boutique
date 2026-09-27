"use client";
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Plus, X } from "lucide-react";
import { repo, RepositoryError, type ProductDraft, type VariantDraft } from "@/data";
import { internalEan13, isValidEan13, skuBaseFromName, sortSizes, variantSku } from "@/domain/codes";
import { formatBps, formatMoney, marginBps, roundHalfAwayFromZero } from "@/domain/money";
import type { Cents, Product, ProductVariant } from "@/domain/types";
import { useCatalog } from "@/stores/catalog";
import { STORE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChipsInput, type ChipPreset } from "./chips-input";
import { variantKey } from "./inventory-utils";

const SIZE_PRESETS: ChipPreset[] = [
  { label: "Ropa XS–XL", values: ["XS", "S", "M", "L", "XL"] },
  { label: "Calzado 35–40", values: ["35", "36", "37", "38", "39", "40"] },
  { label: "Jeans 26–34", values: ["26", "27", "28", "29", "30", "31", "32", "33", "34"] },
  { label: "Talla única", values: ["ÚNICA"] },
];
const COLOR_PRESETS: ChipPreset[] = ["Negro", "Blanco", "Beige", "Rosa", "Rojo", "Azul", "Verde"].map((c) => ({
  label: `+ ${c}`,
  values: [c],
}));

const NO_CATEGORY = "__none";
const NEW_CATEGORY = "__new";

const formatSize = (s: string) => s.trim().toUpperCase();
const formatColor = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

/** Estado editable de una celda de la matriz. */
interface Row {
  id?: string;
  size: string | null;
  color: string | null;
  /** Solo variantes existentes: SKU/código guardados. */
  sku: string;
  /** En nuevas: vacío = automático. */
  barcode: string;
  price: Cents | null;
  cost: Cents | null;
  initialStock: number;
  minStock: number;
  active: boolean;
  stock: number;
}

function rowFromVariant(v: ProductVariant): Row {
  return {
    id: v.id, size: v.size, color: v.color, sku: v.sku, barcode: v.barcode, price: v.price, cost: v.cost,
    initialStock: 0, minStock: v.minStock, active: v.active, stock: v.stock,
  };
}

function newRow(size: string | null, color: string | null): Row {
  return {
    size, color, sku: "", barcode: "", price: null, cost: null, initialStock: 0,
    minStock: STORE.lowStockDefault, active: true, stock: 0,
  };
}

export function ProductEditor({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = producto nuevo. */
  product: Product | null;
}) {
  // El contenido del Sheet se desmonta al cerrar, así cada apertura parte limpia.
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <EditorBody key={product?.id ?? "new"} product={product} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function EditorBody({ product, onDone }: { product: Product | null; onDone: () => void }) {
  const categories = useCatalog((s) => s.categories);
  const allProducts = useCatalog((s) => s.products);
  const allVariants = useCatalog((s) => s.variants);

  // Foto al abrir: una recarga del catálogo no debe pisar lo que se edita.
  const [existing] = React.useState(() =>
    product ? allVariants.filter((v) => v.productId === product.id) : [],
  );

  // ---------- Campos del producto ----------
  const [name, setName] = React.useState(product?.name ?? "");
  const [brand, setBrand] = React.useState(product?.brand ?? "");
  const [categoryId, setCategoryId] = React.useState<string | null>(product?.categoryId ?? null);
  const [description, setDescription] = React.useState(product?.description ?? "");
  const [skuTouched, setSkuTouched] = React.useState(!!product);
  const [skuInput, setSkuInput] = React.useState(product?.skuBase ?? "");
  const [price, setPrice] = React.useState<Cents | null>(product ? product.basePrice : null);
  const [cost, setCost] = React.useState<Cents | null>(product ? product.baseCost : null);
  const [active, setActive] = React.useState(product?.active ?? true);
  const skuBase = skuTouched ? skuInput : name.trim() ? skuBaseFromName(name) : "";

  // ---------- Matriz ----------
  const { initialSizes, initialColors, initialRows, extras } = React.useMemo(() => {
    const basis = existing.some((v) => v.active) ? existing.filter((v) => v.active) : existing;
    const sizes = sortSizes([...new Set(basis.map((v) => v.size).filter((s): s is string => !!s))]);
    const colors = [...new Set(basis.map((v) => v.color).filter((c): c is string => !!c))];
    const rows: Record<string, Row> = {};
    const extras: ProductVariant[] = [];
    for (const v of existing) {
      const k = variantKey(v.size, v.color);
      if (rows[k]) extras.push(v);
      else rows[k] = rowFromVariant(v);
    }
    return { initialSizes: sizes, initialColors: colors, initialRows: rows, extras };
  }, [existing]);

  const [sizes, setSizes] = React.useState<string[]>(initialSizes);
  const [colors, setColors] = React.useState<string[]>(initialColors);
  const [rows, setRows] = React.useState<Record<string, Row>>(initialRows);
  const [saving, setSaving] = React.useState(false);

  const combos = React.useMemo(() => {
    const ss: (string | null)[] = sizes.length ? sizes : [null];
    const cs: (string | null)[] = colors.length ? colors : [null];
    return ss.flatMap((size) => cs.map((color) => ({ key: variantKey(size, color), size, color })));
  }, [sizes, colors]);

  const getRow = React.useCallback(
    (c: { key: string; size: string | null; color: string | null }) => rows[c.key] ?? newRow(c.size, c.color),
    [rows],
  );
  const patchRow = (c: { key: string; size: string | null; color: string | null }, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [c.key]: { ...(r[c.key] ?? newRow(c.size, c.color)), ...patch } }));
  const patchAll = (patch: (row: Row) => Partial<Row>) =>
    setRows((r) => {
      const next = { ...r };
      for (const c of combos) {
        const row = next[c.key] ?? newRow(c.size, c.color);
        next[c.key] = { ...row, ...patch(row) };
      }
      return next;
    });

  const comboKeys = React.useMemo(() => new Set(combos.map((c) => c.key)), [combos]);
  /** Variantes existentes que salieron de la matriz: se guardan inactivas. */
  const orphans = React.useMemo(
    () => Object.entries(rows).filter(([k, r]) => r.id && !comboKeys.has(k)).map(([, r]) => r),
    [rows, comboKeys],
  );

  // SKU planificado para variantes nuevas, sin choques con el catálogo ni entre sí.
  const plannedSkus = React.useMemo(() => {
    const own = new Set(existing.map((v) => v.id));
    const taken = new Set(allVariants.filter((v) => !own.has(v.id)).map((v) => v.sku.toUpperCase()));
    for (const r of Object.values(rows)) if (r.id) taken.add(r.sku.toUpperCase());
    for (const e of extras) taken.add(e.sku.toUpperCase());
    const out = new Map<string, string>();
    const base = skuBase.trim().toUpperCase() || "PRD";
    for (const c of combos) {
      if (rows[c.key]?.id) continue;
      const sku0 = variantSku(base, c.size, c.color);
      let sku = sku0;
      for (let i = 2; taken.has(sku.toUpperCase()); i++) sku = `${sku0}-${i}`;
      taken.add(sku.toUpperCase());
      out.set(c.key, sku);
    }
    return out;
  }, [combos, rows, skuBase, allVariants, existing, extras]);

  const skuBaseClash = React.useMemo(() => {
    const b = skuBase.trim().toUpperCase();
    return !!b && allProducts.some((p) => p.id !== product?.id && p.skuBase.toUpperCase() === b);
  }, [skuBase, allProducts, product]);

  // Validación de códigos escritos a mano.
  const barcodeErrors = React.useMemo(() => {
    const errs = new Map<string, string>();
    const own = new Set(existing.map((v) => v.id));
    const catalogCodes = new Set(allVariants.filter((v) => !own.has(v.id)).map((v) => v.barcode));
    const seen = new Map<string, string>();
    for (const c of combos) {
      const r = getRow(c);
      const code = r.barcode.trim();
      if (!code) continue;
      if (!r.id) {
        if (!/^[0-9A-Za-z-]+$/.test(code)) errs.set(c.key, "Solo letras, números y guiones.");
        else if (/^\d{13}$/.test(code) && !isValidEan13(code)) errs.set(c.key, "EAN-13 inválido (dígito verificador).");
        else if (catalogCodes.has(code)) errs.set(c.key, "Código ya usado por otro producto.");
      }
      if (seen.has(code)) errs.set(c.key, "Código repetido en la matriz.");
      seen.set(code, c.key);
    }
    return errs;
  }, [combos, getRow, allVariants, existing]);

  // ---------- Calculadora de margen ----------
  const m = price != null && cost != null ? marginBps(price, cost) : null;
  const profit = price != null && cost != null ? price - cost : null;
  const [targetMargin, setTargetMargin] = React.useState("50");
  const target = Number(targetMargin.replace(",", "."));
  const suggested =
    cost != null && cost > 0 && Number.isFinite(target) && target > 0 && target < 100
      ? roundHalfAwayFromZero(cost / (1 - target / 100))
      : null;

  // ---------- Categoría en línea ----------
  const [creatingCat, setCreatingCat] = React.useState(false);
  const [newCat, setNewCat] = React.useState("");
  const [catBusy, setCatBusy] = React.useState(false);
  async function createCategory() {
    const n = newCat.trim();
    if (!n) return;
    const dup = categories.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (dup) {
      setCategoryId(dup.id);
      setCreatingCat(false);
      setNewCat("");
      return;
    }
    setCatBusy(true);
    try {
      const sortOrder = categories.reduce((a, c) => Math.max(a, c.sortOrder), 0) + 1;
      const cat = await repo().saveCategory({ name: n, sortOrder });
      await useCatalog.getState().load(true);
      setCategoryId(cat.id);
      setCreatingCat(false);
      setNewCat("");
      toast.success(`Categoría "${cat.name}" creada`);
    } catch (e) {
      toast.error(e instanceof RepositoryError ? e.message : "No se pudo crear la categoría.");
    } finally {
      setCatBusy(false);
    }
  }

  const brands = React.useMemo(
    () => [...new Set(allProducts.map((p) => p.brand).filter((b): b is string => !!b))].sort(),
    [allProducts],
  );

  // ---------- Guardar ----------
  const newCount = combos.filter((c) => !rows[c.key]?.id).length;
  const totalInitial = combos.reduce((a, c) => a + (rows[c.key]?.id ? 0 : getRow(c).initialStock), 0);

  async function save() {
    if (!name.trim()) return toast.error("El nombre es obligatorio.");
    if (!skuBase.trim()) return toast.error("El SKU base es obligatorio.");
    if (price == null || price <= 0) return toast.error("Ingresa un precio de venta válido.");
    if (barcodeErrors.size) return toast.error("Revisa los códigos de barras marcados.");

    setSaving(true);
    try {
      const needAuto = combos.filter((c) => !rows[c.key]?.id && !getRow(c).barcode.trim());
      let seq = needAuto.length ? await repo().reserveBarcodeSequence(needAuto.length) : 0;

      const variants: VariantDraft[] = combos.map((c) => {
        const r = getRow(c);
        if (r.id) {
          return {
            id: r.id, size: r.size, color: r.color, sku: r.sku, barcode: r.barcode,
            price: r.price, cost: r.cost, minStock: r.minStock, active: r.active,
          };
        }
        const code = r.barcode.trim() || internalEan13(seq++);
        return {
          size: c.size, color: c.color, sku: plannedSkus.get(c.key)!, barcode: code,
          price: r.price, cost: r.cost, initialStock: Math.max(0, Math.trunc(r.initialStock)),
          minStock: Math.max(0, Math.trunc(r.minStock)), active: r.active,
        };
      });
      for (const r of orphans) {
        variants.push({
          id: r.id, size: r.size, color: r.color, sku: r.sku, barcode: r.barcode,
          price: r.price, cost: r.cost, minStock: r.minStock, active: false,
        });
      }
      for (const v of extras) {
        variants.push({
          id: v.id, size: v.size, color: v.color, sku: v.sku, barcode: v.barcode,
          price: v.price, cost: v.cost, minStock: v.minStock, active: v.active,
        });
      }

      const draft: ProductDraft = {
        id: product?.id,
        categoryId,
        name: name.trim(),
        brand: brand.trim() || null,
        description: description.trim() || null,
        skuBase: skuBase.trim().toUpperCase(),
        basePrice: price,
        baseCost: cost ?? 0,
        imageUrl: product?.imageUrl ?? null,
        active,
        variants,
      };
      await repo().saveProduct(draft);
      toast.success(product ? "Producto actualizado" : "Producto creado");
      await useCatalog.getState().load(true);
      onDone();
    } catch (e) {
      toast.error(e instanceof RepositoryError ? e.message : "No se pudo guardar el producto.");
      setSaving(false);
    }
  }

  // ---------- Acciones masivas ----------
  const [bulkStock, setBulkStock] = React.useState("");
  const [bulkMin, setBulkMin] = React.useState("");
  const intOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Math.max(0, Math.trunc(Number(s))));

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{product ? "Editar producto" : "Nuevo producto"}</SheetTitle>
        <SheetDescription>
          {product ? "Los cambios de stock se hacen con “Ajustar stock”." : "Datos básicos y matriz de tallas y colores."}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-4">
          {/* Datos generales */}
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="pe-name" className="sm:col-span-2">
              <Input id="pe-name" autoFocus={!product} value={name} onChange={(e) => setName(e.target.value)} placeholder="Blusa de lino" />
            </Field>
            <Field label="Marca" htmlFor="pe-brand">
              <Input id="pe-brand" list="pe-brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Opcional" />
              <datalist id="pe-brands">
                {brands.map((b) => <option key={b} value={b} />)}
              </datalist>
            </Field>
            <Field
              label="SKU base"
              htmlFor="pe-sku"
              hint={
                skuBaseClash ? (
                  <span className="text-warning">Otro producto usa este SKU base.</span>
                ) : !skuTouched ? "Sugerido a partir del nombre." : product && skuBase !== product.skuBase ? "Solo afecta a variantes nuevas." : null
              }
            >
              <Input
                id="pe-sku"
                className="font-mono uppercase"
                value={skuBase}
                onChange={(e) => {
                  setSkuTouched(true);
                  setSkuInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
                }}
                placeholder="BLU-LIN"
              />
            </Field>
            <Field label="Categoría" className="sm:col-span-2">
              {creatingCat ? (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    placeholder="Nombre de la categoría"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createCategory();
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setCreatingCat(false);
                      }
                    }}
                  />
                  <Button type="button" size="icon" onClick={createCategory} disabled={catBusy || !newCat.trim()} aria-label="Crear categoría">
                    {catBusy ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setCreatingCat(false)} aria-label="Cancelar">
                    <X />
                  </Button>
                </div>
              ) : (
                <Select
                  value={categoryId ?? NO_CATEGORY}
                  onValueChange={(v) => {
                    if (v === NEW_CATEGORY) setCreatingCat(true);
                    else setCategoryId(v === NO_CATEGORY ? null : v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                    <SelectItem value={NEW_CATEGORY} className="text-brand">+ Nueva categoría…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Descripción" htmlFor="pe-desc" className="sm:col-span-2">
              <Textarea id="pe-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
            </Field>
          </section>

          {/* Precio y margen */}
          <section className="grid gap-3 rounded-xl border p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio de venta" htmlFor="pe-price">
                <MoneyInput id="pe-price" value={price} onValueChange={setPrice} placeholder="0.00" />
              </Field>
              <Field label="Costo" htmlFor="pe-cost">
                <MoneyInput id="pe-cost" value={cost} onValueChange={setCost} placeholder="0.00" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Margen</div>
                <div
                  className={cn(
                    "font-semibold tabular",
                    m != null && m < 0 && "text-destructive",
                    m != null && m >= 0 && m < 3000 && "text-warning",
                    m != null && m >= 3000 && "text-success",
                  )}
                >
                  {m != null && price ? formatBps(m) : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">Ganancia por unidad</div>
                <div className={cn("font-semibold tabular", profit != null && profit < 0 && "text-destructive")}>
                  {profit != null ? formatMoney(profit) : "—"}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Precio sugerido para</span>
              <div className="relative w-20">
                <Input
                  aria-label="Margen objetivo"
                  inputMode="decimal"
                  className="h-8 pr-6 tabular"
                  value={targetMargin}
                  onChange={(e) => setTargetMargin(e.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <span className="text-muted-foreground">de margen:</span>
              <span className="font-semibold tabular">{suggested != null ? formatMoney(suggested) : "—"}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={suggested == null}
                onClick={() => suggested != null && setPrice(suggested)}
              >
                Usar
              </Button>
            </div>
          </section>

          {/* Matriz */}
          <section className="grid gap-4">
            <div>
              <h3 className="text-sm font-semibold">Variantes</h3>
              <p className="text-xs text-muted-foreground">
                Tallas × colores. Sin tallas ni colores se crea una sola variante.
              </p>
            </div>
            <Field label="Tallas" htmlFor="pe-sizes">
              <ChipsInput
                id="pe-sizes"
                value={sizes}
                onChange={setSizes}
                format={formatSize}
                sort={sortSizes}
                presets={SIZE_PRESETS}
                presetMode="replace"
                placeholder="Escribe y pulsa Enter: S, M, L…"
              />
            </Field>
            <Field label="Colores" htmlFor="pe-colors">
              <ChipsInput
                id="pe-colors"
                value={colors}
                onChange={setColors}
                format={formatColor}
                presets={COLOR_PRESETS}
                presetMode="add"
                placeholder="Negro, Blanco…"
              />
            </Field>

            <div className="flex flex-wrap items-end gap-2">
              {newCount > 0 && (
                <BulkField
                  label="Stock inicial para todas"
                  value={bulkStock}
                  onChange={setBulkStock}
                  onApply={() => {
                    const n = intOrNull(bulkStock);
                    if (n != null) patchAll((r) => (r.id ? {} : { initialStock: n }));
                  }}
                />
              )}
              <BulkField
                label="Mínimo para todas"
                value={bulkMin}
                onChange={setBulkMin}
                onApply={() => {
                  const n = intOrNull(bulkMin);
                  if (n != null) patchAll(() => ({ minStock: n }));
                }}
              />
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Variante</th>
                    <th className="px-2 py-2 font-medium">SKU / código</th>
                    <th className="w-20 px-2 py-2 font-medium">Stock</th>
                    <th className="w-20 px-2 py-2 font-medium">Mínimo</th>
                    <th className="w-28 px-2 py-2 font-medium">Precio</th>
                    <th className="w-14 px-2 py-2 text-center font-medium">Activa</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {combos.map((c) => {
                    const r = getRow(c);
                    const isNew = !r.id;
                    const err = barcodeErrors.get(c.key);
                    return (
                      <tr key={c.key} className={cn(!r.active && "bg-muted/30 text-muted-foreground")}>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">
                              {[c.size, c.color].filter(Boolean).join(" / ") || "Única"}
                            </span>
                            {isNew && (
                              <span className="rounded bg-brand/12 px-1 text-[10px] font-medium text-brand">nueva</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-mono text-[11px]">{isNew ? plannedSkus.get(c.key) : r.sku}</div>
                          {isNew ? (
                            <>
                              <Input
                                aria-label="Código de barras"
                                value={r.barcode}
                                onChange={(e) => patchRow(c, { barcode: e.target.value.trim() })}
                                placeholder="EAN-13 automático"
                                className="mt-0.5 h-7 font-mono text-xs"
                                aria-invalid={!!err}
                              />
                              {err && <div className="mt-0.5 text-[11px] text-destructive">{err}</div>}
                            </>
                          ) : (
                            <div className="font-mono text-[11px] text-muted-foreground">{r.barcode}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {isNew ? (
                            <NumberCell
                              label="Stock inicial"
                              value={r.initialStock}
                              onChange={(n) => patchRow(c, { initialStock: n })}
                            />
                          ) : (
                            <span className="tabular" title="Usa “Ajustar stock” para cambiarlo">{r.stock}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <NumberCell label="Stock mínimo" value={r.minStock} onChange={(n) => patchRow(c, { minStock: n })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <MoneyInput
                            aria-label="Precio propio"
                            value={r.price}
                            onValueChange={(v) => patchRow(c, { price: v })}
                            placeholder={price != null ? (price / 100).toFixed(2) : "Base"}
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Switch
                            checked={r.active}
                            onCheckedChange={(v) => patchRow(c, { active: v })}
                            aria-label="Variante activa"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {combos.length} {combos.length === 1 ? "variante" : "variantes"}
              {newCount > 0 && ` · ${newCount} nuevas${totalInitial ? ` con ${totalInitial} u. iniciales` : ""}`}
              {" · "}Precio vacío = usa el precio base.
            </p>
            {orphans.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">
                    {orphans.length} {orphans.length === 1 ? "variante existente quedará inactiva" : "variantes existentes quedarán inactivas"}
                  </p>
                  <p className="text-muted-foreground">
                    No se borran (conservan historial y ventas):{" "}
                    {orphans.map((o) => [o.size, o.color].filter(Boolean).join(" / ") || "Única").join(", ")}.
                  </p>
                </div>
              </div>
            )}
          </section>

          <Separator />
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Producto activo</span>
              <span className="block text-xs text-muted-foreground">Los inactivos no aparecen en el punto de venta.</span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
      </div>

      <div className="flex gap-2 border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onDone} disabled={saving}>
          Cancelar
        </Button>
        <div className="hidden flex-1 sm:block" />
        <Button type="submit" className="flex-1 sm:flex-none" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          {product ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberCell({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <Input
      aria-label={label}
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      value={value === 0 ? "" : value}
      placeholder="0"
      onChange={(e) => {
        const n = Math.trunc(Number(e.target.value));
        onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
      }}
      onFocus={(e) => e.target.select()}
      className="h-7 w-16 px-2 text-xs tabular"
    />
  );
}

function BulkField({
  label,
  value,
  onChange,
  onApply,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-1 pl-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onApply();
          }
        }}
        className="h-7 w-16 px-2 text-xs tabular"
      />
      <Button type="button" size="sm" variant="secondary" className="h-7" onClick={onApply}>
        <Plus className="size-3.5" />
        Aplicar
      </Button>
    </div>
  );
}
