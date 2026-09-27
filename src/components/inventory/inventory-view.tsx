"use client";
import * as React from "react";
import {
  ChevronRight, History, PackageOpen, Pencil, Plus, Search, SlidersHorizontal, Tag, X,
} from "lucide-react";
import { formatBps, formatMoney, marginBps } from "@/domain/money";
import { sortSizes } from "@/domain/codes";
import type { Product, ProductVariant } from "@/domain/types";
import { useCatalog } from "@/stores/catalog";
import { useIsAdmin } from "@/stores/session";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HistoryDialog } from "./history-dialog";
import { LabelsDialog, type LabelsTarget } from "./labels-dialog";
import { ProductEditor } from "./product-editor";
import { StockAdjustDialog } from "./stock-adjust-dialog";
import { STOCK_TEXT, normalize, stockStatus } from "./inventory-utils";

type StockFilter = "all" | "low" | "out";
const ALL = "__all";
const NONE = "__none";

interface ProductGroup {
  product: Product;
  categoryName: string | null;
  variants: ProductVariant[];
  totalStock: number;
  lowCount: number;
  outCount: number;
  activeCount: number;
  /** Texto normalizado del producto (nombre, marca, SKU base). */
  haystack: string;
  /** Códigos de variantes (SKU y barras) normalizados. */
  codes: string[];
}

export function InventoryView() {
  const loaded = useCatalog((s) => s.loaded);
  const products = useCatalog((s) => s.products);
  const variants = useCatalog((s) => s.variants);
  const categories = useCatalog((s) => s.categories);
  const views = useCatalog((s) => s.views);
  const byId = useCatalog((s) => s.byId);
  const isAdmin = useIsAdmin();

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState(ALL);
  const [stockFilter, setStockFilter] = React.useState<StockFilter>("all");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const [editor, setEditor] = React.useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [adjustId, setAdjustId] = React.useState<string | null>(null);
  const [historyId, setHistoryId] = React.useState<string | null>(null);
  const [labels, setLabels] = React.useState<LabelsTarget | null>(null);

  const deferredSearch = React.useDeferredValue(search);

  // Agrupa variantes por producto (se recalcula solo si cambia el catálogo).
  const groups = React.useMemo<ProductGroup[]>(() => {
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const byProduct = new Map<string, ProductVariant[]>();
    for (const v of variants) {
      const list = byProduct.get(v.productId);
      if (list) list.push(v);
      else byProduct.set(v.productId, [v]);
    }
    return products
      .map((p) => {
        const vs = byProduct.get(p.id) ?? [];
        const order = new Map(sortSizes([...new Set(vs.map((v) => v.size ?? ""))]).map((s, i) => [s, i]));
        vs.sort(
          (a, b) =>
            Number(b.active) - Number(a.active) ||
            order.get(a.size ?? "")! - order.get(b.size ?? "")! ||
            (a.color ?? "").localeCompare(b.color ?? "", "es"),
        );
        let totalStock = 0, lowCount = 0, outCount = 0, activeCount = 0;
        for (const v of vs) {
          totalStock += v.stock;
          if (!v.active || !p.active) continue;
          activeCount++;
          const st = stockStatus(v);
          if (st === "out") outCount++;
          else if (st === "low") lowCount++;
        }
        return {
          product: p,
          categoryName: p.categoryId ? catName.get(p.categoryId) ?? null : null,
          variants: vs,
          totalStock,
          lowCount,
          outCount,
          activeCount,
          haystack: normalize([p.name, p.brand ?? "", p.skuBase].join(" ")),
          codes: vs.flatMap((v) => [normalize(v.sku), v.barcode.toLowerCase()]),
        };
      })
      .sort((a, b) => Number(b.product.active) - Number(a.product.active) || a.product.name.localeCompare(b.product.name, "es"));
  }, [products, variants, categories]);

  const kpis = React.useMemo(() => {
    let units = 0, cost = 0, retail = 0, low = 0, out = 0;
    for (const v of views) {
      if (v.stock > 0) {
        units += v.stock;
        cost += v.stock * v.effectiveCost;
        retail += v.stock * v.effectivePrice;
      }
      if (!v.active) continue;
      const st = stockStatus(v);
      if (st === "out") out++;
      else if (st === "low") low++;
    }
    return { units, cost, retail, low, out };
  }, [views]);

  const { filtered, autoExpanded } = React.useMemo(() => {
    const q = normalize(deferredSearch);
    const terms = q.split(/\s+/).filter(Boolean);
    const autoExpanded = new Set<string>();
    const filtered = groups.filter((g) => {
      if (categoryFilter !== ALL && (g.product.categoryId ?? NONE) !== categoryFilter) return false;
      if (stockFilter === "out" && g.outCount === 0) return false;
      if (stockFilter === "low" && g.outCount + g.lowCount === 0) return false;
      if (!terms.length) return true;
      if (terms.every((t) => g.haystack.includes(t))) return true;
      // Coincidencia por SKU / código de variante: se expande para mostrarla.
      if (g.codes.some((c) => c.includes(q.replace(/\s+/g, "")))) {
        autoExpanded.add(g.product.id);
        return true;
      }
      return false;
    });
    return { filtered, autoExpanded };
  }, [groups, deferredSearch, categoryFilter, stockFilter]);

  const isOpen = (id: string) => expanded.has(id) !== autoExpanded.has(id);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const actions: RowActions = {
    isAdmin,
    onEdit: (p) => setEditor({ open: true, product: p }),
    onLabels: (g) => setLabels({ product: g.product, variants: g.variants }),
    onAdjust: (v) => setAdjustId(v.id),
    onHistory: (v) => setHistoryId(v.id),
    stockFilter,
  };

  const filtersActive = !!search || categoryFilter !== ALL || stockFilter !== "all";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 md:p-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Unidades" value={loaded ? kpis.units.toLocaleString("es-NI") : null} />
        {isAdmin && <Kpi label="Valor al costo" value={loaded ? formatMoney(kpis.cost) : null} />}
        <Kpi label="Valor a precio venta" value={loaded ? formatMoney(kpis.retail) : null} />
        <Kpi
          label="Bajo stock"
          value={loaded ? String(kpis.low) : null}
          tone={kpis.low ? "warning" : undefined}
          active={stockFilter === "low"}
          onClick={() => setStockFilter((f) => (f === "low" ? "all" : "low"))}
        />
        <Kpi
          label="Agotadas"
          value={loaded ? String(kpis.out) : null}
          tone={kpis.out ? "destructive" : undefined}
          active={stockFilter === "out"}
          onClick={() => setStockFilter((f) => (f === "out" ? "all" : "out"))}
        />
      </div>

      {/* Barra de herramientas */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o código…"
            className="pl-9"
            aria-label="Buscar productos"
          />
        </div>
        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-44" aria-label="Categoría">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
              <SelectItem value={NONE}>Sin categoría</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button className="shrink-0" onClick={() => setEditor({ open: true, product: null })}>
              <Plus />
              <span className="hidden sm:inline">Nuevo producto</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          )}
        </div>
        <ToggleGroup
          type="single"
          value={stockFilter}
          onValueChange={(v) => v && setStockFilter(v as StockFilter)}
          className="flex-nowrap md:order-first"
        >
          <ToggleGroupItem value="all" className="h-9 flex-1 text-xs md:flex-none">Todos</ToggleGroupItem>
          <ToggleGroupItem value="low" className="h-9 flex-1 text-xs md:flex-none">Bajo stock</ToggleGroupItem>
          <ToggleGroupItem value="out" className="h-9 flex-1 text-xs md:flex-none">Agotado</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {filtered.length} de {groups.length} productos
          {!isAdmin && " · solo lectura"}
        </span>
        {filtersActive && (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => {
              setSearch("");
              setCategoryFilter(ALL);
              setStockFilter("all");
            }}
          >
            <X className="size-3" /> Limpiar filtros
          </button>
        )}
      </div>

      {!loaded ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <PackageOpen className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {groups.length === 0 ? "Aún no hay productos." : "Ningún producto coincide con los filtros."}
          </p>
          {groups.length === 0 && isAdmin && (
            <Button size="sm" onClick={() => setEditor({ open: true, product: null })}>
              <Plus /> Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <>
          <DesktopTable groups={filtered} isOpen={isOpen} toggle={toggle} actions={actions} />
          <MobileList groups={filtered} isOpen={isOpen} toggle={toggle} actions={actions} />
        </>
      )}

      <ProductEditor
        open={editor.open}
        product={editor.product}
        onOpenChange={(open) => setEditor((e) => ({ ...e, open }))}
      />
      <StockAdjustDialog
        variant={adjustId ? byId.get(adjustId) ?? null : null}
        onOpenChange={(o) => !o && setAdjustId(null)}
      />
      <HistoryDialog
        variant={historyId ? byId.get(historyId) ?? null : null}
        onOpenChange={(o) => !o && setHistoryId(null)}
      />
      <LabelsDialog target={labels} onOpenChange={(o) => !o && setLabels(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RowActions {
  isAdmin: boolean;
  stockFilter: StockFilter;
  onEdit: (p: Product) => void;
  onLabels: (g: ProductGroup) => void;
  onAdjust: (v: ProductVariant) => void;
  onHistory: (v: ProductVariant) => void;
}

interface ListProps {
  groups: ProductGroup[];
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  actions: RowActions;
}

function Kpi({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string | null;
  tone?: "warning" | "destructive";
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {value == null ? (
        <Skeleton className="mt-1 h-5 w-16" />
      ) : (
        <div
          className={cn(
            "text-base font-semibold tabular md:text-lg",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}
        </div>
      )}
    </>
  );
  const cls = cn(
    "rounded-xl border px-3 py-2 text-left transition-colors",
    onClick && "hover:bg-muted/50",
    active && "border-foreground/40 bg-muted/60",
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function StatusBadge({ g }: { g: ProductGroup }) {
  if (!g.product.active) return <Badge variant="secondary">Inactivo</Badge>;
  if (g.activeCount > 0 && g.outCount === g.activeCount) return <Badge variant="destructive">Agotado</Badge>;
  return (
    <span className="inline-flex gap-1">
      {g.outCount > 0 && <Badge variant="destructive">{g.outCount} agotada{g.outCount > 1 ? "s" : ""}</Badge>}
      {g.lowCount > 0 && <Badge variant="warning">Bajo stock</Badge>}
    </span>
  );
}

function Margin({ p }: { p: Product }) {
  const m = marginBps(p.basePrice, p.baseCost);
  return (
    <span className={cn("tabular", m < 0 ? "text-destructive" : m < 3000 ? "text-warning" : "text-muted-foreground")}>
      {formatBps(m)}
    </span>
  );
}

function label(v: ProductVariant) {
  return [v.size, v.color].filter(Boolean).join(" / ") || "Única";
}

/** Oculta variantes que no aplican al filtro de stock activo (solo al filtrar). */
function visibleVariants(g: ProductGroup, filter: StockFilter) {
  if (filter === "all") return g.variants;
  return g.variants.filter((v) => {
    const st = stockStatus(v);
    return filter === "out" ? st === "out" : st !== "ok";
  });
}

function DesktopTable({ groups, isOpen, toggle, actions }: ListProps) {
  const { isAdmin } = actions;
  const cols = isAdmin ? 9 : 7;
  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="w-8" />
            <th className="px-3 py-2 font-medium">Producto</th>
            <th className="px-3 py-2 font-medium">Categoría</th>
            <th className="px-3 py-2 text-right font-medium">Precio</th>
            {isAdmin && <th className="px-3 py-2 text-right font-medium">Costo</th>}
            {isAdmin && <th className="px-3 py-2 text-right font-medium">Margen</th>}
            <th className="px-3 py-2 text-right font-medium">Stock</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = isOpen(g.product.id);
            return (
              <React.Fragment key={g.product.id}>
                <tr
                  className={cn(
                    "cursor-pointer border-b transition-colors hover:bg-muted/40",
                    open && "bg-muted/30",
                    !g.product.active && "text-muted-foreground",
                  )}
                  onClick={() => toggle(g.product.id)}
                >
                  <td className="pl-3">
                    <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{g.product.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[g.product.brand, g.product.skuBase].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{g.categoryName ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatMoney(g.product.basePrice)}</td>
                  {isAdmin && (
                    <td className="px-3 py-2.5 text-right text-muted-foreground tabular">{formatMoney(g.product.baseCost)}</td>
                  )}
                  {isAdmin && (
                    <td className="px-3 py-2.5 text-right">
                      <Margin p={g.product} />
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right font-medium tabular">
                    {g.totalStock}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">/ {g.variants.length} var.</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge g={g} />
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-0.5">
                      <Button size="icon-sm" variant="ghost" title="Etiquetas" aria-label="Etiquetas" onClick={() => actions.onLabels(g)}>
                        <Tag />
                      </Button>
                      {isAdmin && (
                        <Button size="icon-sm" variant="ghost" title="Editar" aria-label="Editar" onClick={() => actions.onEdit(g.product)}>
                          <Pencil />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr className="border-b bg-muted/20">
                    <td colSpan={cols} className="px-3 pt-1 pb-3 pl-11">
                      <VariantTable g={g} actions={actions} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VariantTable({ g, actions }: { g: ProductGroup; actions: RowActions }) {
  const list = visibleVariants(g, actions.stockFilter);
  if (!list.length) return <p className="py-2 text-xs text-muted-foreground">Sin variantes.</p>;
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Talla</th>
          <th className="py-1.5 pr-3 font-medium">Color</th>
          <th className="py-1.5 pr-3 font-medium">SKU</th>
          <th className="py-1.5 pr-3 font-medium">Código</th>
          <th className="py-1.5 pr-3 text-right font-medium">Precio</th>
          <th className="py-1.5 pr-3 text-right font-medium">Stock</th>
          <th className="py-1.5 pr-3 text-right font-medium">Mín.</th>
          <th />
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {list.map((v) => (
          <tr key={v.id} className={cn(!v.active && "text-muted-foreground")}>
            <td className="py-1.5 pr-3 font-medium">{v.size ?? "—"}</td>
            <td className="py-1.5 pr-3">
              {v.color ?? "—"}
              {!v.active && <span className="ml-1.5 text-[10px] uppercase">inactiva</span>}
            </td>
            <td className="py-1.5 pr-3 font-mono">{v.sku}</td>
            <td className="py-1.5 pr-3 font-mono text-muted-foreground">{v.barcode}</td>
            <td className="py-1.5 pr-3 text-right tabular">
              {v.price != null ? formatMoney(v.price) : <span className="text-muted-foreground">base</span>}
            </td>
            <td className={cn("py-1.5 pr-3 text-right text-sm tabular", v.active && STOCK_TEXT[stockStatus(v)])}>{v.stock}</td>
            <td className="py-1.5 pr-3 text-right text-muted-foreground tabular">{v.minStock}</td>
            <td className="py-1 text-right whitespace-nowrap">
              <VariantButtons v={v} actions={actions} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VariantButtons({ v, actions, compact }: { v: ProductVariant; actions: RowActions; compact?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      {actions.isAdmin && (
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => actions.onAdjust(v)}>
          <SlidersHorizontal className="size-3.5" />
          {compact ? "Ajustar" : "Ajustar stock"}
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => actions.onHistory(v)} aria-label="Historial">
        <History className="size-3.5" />
        {!compact && "Historial"}
      </Button>
    </span>
  );
}

function MobileList({ groups, isOpen, toggle, actions }: ListProps) {
  return (
    <div className="grid gap-2 md:hidden">
      {groups.map((g) => {
        const open = isOpen(g.product.id);
        const list = open ? visibleVariants(g, actions.stockFilter) : [];
        return (
          <div key={g.product.id} className={cn("rounded-xl border", !g.product.active && "opacity-70")}>
            <button
              type="button"
              className="flex w-full items-start gap-3 p-3 text-left"
              onClick={() => toggle(g.product.id)}
              aria-expanded={open}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{g.product.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[g.product.brand, g.categoryName].filter(Boolean).join(" · ") || g.product.skuBase}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-semibold tabular">{formatMoney(g.product.basePrice)}</span>
                  {actions.isAdmin && (
                    <span className="text-muted-foreground">
                      Margen <Margin p={g.product} />
                    </span>
                  )}
                  <StatusBadge g={g} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg leading-none font-semibold tabular">{g.totalStock}</div>
                <div className="text-[11px] text-muted-foreground">{g.variants.length} var.</div>
                <ChevronRight className={cn("mt-1 ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
              </div>
            </button>
            {open && (
              <div className="border-t px-3 pb-2">
                <ul className="divide-y">
                  {list.map((v) => (
                    <li key={v.id} className={cn("flex items-center gap-2 py-2", !v.active && "text-muted-foreground")}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          {label(v)}
                          {!v.active && <span className="ml-1.5 text-[10px] uppercase">inactiva</span>}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{v.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-base leading-none tabular", v.active && STOCK_TEXT[stockStatus(v)])}>{v.stock}</div>
                        <div className="text-[10px] text-muted-foreground">mín {v.minStock}</div>
                      </div>
                      <VariantButtons v={v} actions={actions} compact />
                    </li>
                  ))}
                  {!list.length && <li className="py-2 text-xs text-muted-foreground">Sin variantes.</li>}
                </ul>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => actions.onLabels(g)}>
                    <Tag /> Etiquetas
                  </Button>
                  {actions.isAdmin && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => actions.onEdit(g.product)}>
                      <Pencil /> Editar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

