"use client";
import * as React from "react";
import { Camera, PackageSearch, ScanBarcode, Search, X } from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { VariantView } from "@/domain/types";
import { useCatalog } from "@/stores/catalog";
import { SCANNER_INPUT_ATTR } from "@/hooks/use-barcode-scanner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { addByCode, addToCart } from "./cart-actions";

export interface ProductGroup {
  productId: string;
  name: string;
  brand: string | null;
  categoryId: string | null;
  variants: VariantView[];
  minPrice: number;
  maxPrice: number;
  stock: number;
  /** Texto normalizado de todas las variantes, para buscar. */
  haystack: string;
}

export interface SearchHandle {
  focus(): void;
  clear(): void;
  isEmpty(): boolean;
}

export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function buildGroups(views: VariantView[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const v of views) {
    if (!v.active) continue;
    let g = map.get(v.productId);
    if (!g) {
      g = {
        productId: v.productId,
        name: v.productName,
        brand: v.brand,
        categoryId: v.categoryId,
        variants: [],
        minPrice: v.effectivePrice,
        maxPrice: v.effectivePrice,
        stock: 0,
        haystack: normalize(`${v.productName} ${v.brand ?? ""}`),
      };
      map.set(v.productId, g);
    }
    g.variants.push(v);
    g.minPrice = Math.min(g.minPrice, v.effectivePrice);
    g.maxPrice = Math.max(g.maxPrice, v.effectivePrice);
    g.stock += Math.max(0, v.stock);
    g.haystack += " " + normalize(`${v.sku} ${v.barcode} ${v.color ?? ""} ${v.size ?? ""}`);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function ProductBrowser({
  apiRef,
  onPick,
  onOpenCamera,
}: {
  apiRef: React.Ref<SearchHandle>;
  /** Producto con varias variantes: abrir selector. */
  onPick: (group: ProductGroup) => void;
  onOpenCamera: () => void;
}) {
  const loaded = useCatalog((s) => s.loaded);
  const views = useCatalog((s) => s.views);
  const categories = useCatalog((s) => s.categories);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(
    apiRef,
    () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => {
        setQuery("");
        if (inputRef.current) inputRef.current.value = "";
      },
      isEmpty: () => !inputRef.current?.value,
    }),
    [],
  );

  // Autofoco solo con teclado físico: en táctil evita abrir el teclado virtual.
  React.useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const groups = React.useMemo(() => buildGroups(views), [views]);
  const usedCategories = React.useMemo(() => {
    const ids = new Set(groups.map((g) => g.categoryId));
    return categories.filter((c) => ids.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [groups, categories]);

  const filtered = React.useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    return groups.filter(
      (g) =>
        (category === null || g.categoryId === category) &&
        tokens.every((t) => g.haystack.includes(t)),
    );
  }, [groups, query, category]);

  const pick = React.useCallback(
    (g: ProductGroup) => {
      if (g.variants.length === 1) {
        addToCart(g.variants[0]);
        return;
      }
      onPick(g);
    },
    [onPick],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
      return;
    }
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    const code = query.trim();
    if (!code) return;
    e.preventDefault();
    if (useCatalog.getState().findByCode(code)) {
      addByCode(code, { sound: true });
      setQuery("");
      return;
    }
    if (filtered.length === 1) {
      pick(filtered[0]);
      setQuery("");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b p-3 md:px-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="pos-search" className="sr-only">
              Buscar producto por nombre, SKU, código, color o talla
            </label>
            <input
              ref={inputRef}
              id="pos-search"
              type="search"
              {...{ [SCANNER_INPUT_ATTR]: "" }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar o escanear…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-12 w-full rounded-lg border border-input bg-background pr-10 pl-11 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            className="size-12 shrink-0"
            onClick={onOpenCamera}
            aria-label="Escanear con la cámara"
            title="Escanear con la cámara"
          >
            <Camera className="size-5" />
          </Button>
        </div>
        {usedCategories.length > 0 && (
          <div
            role="radiogroup"
            aria-label="Categoría"
            className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] md:-mx-4 md:px-4"
          >
            <Chip active={category === null} onClick={() => setCategory(null)}>
              Todo
            </Chip>
            {usedCategories.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 md:px-4">
        {!loaded ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid h-full place-items-center py-12 text-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <PackageSearch className="size-8 opacity-50" />
              {query ? `Sin resultados para “${query}”.` : "No hay productos en esta categoría."}
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="Productos">
            {filtered.map((g) => (
              <li key={g.productId}>
                <ProductCard group={g} onPick={pick} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 hidden items-center justify-center gap-1.5 text-xs text-muted-foreground lg:flex">
          <ScanBarcode className="size-3.5" /> Escanea en cualquier momento · <Kbd>F9</Kbd> cobrar ·{" "}
          <Kbd>+</Kbd>/<Kbd>−</Kbd> cantidad · <Kbd>Supr</Kbd> quitar
        </p>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

const ProductCard = React.memo(function ProductCard({
  group,
  onPick,
}: {
  group: ProductGroup;
  onPick: (g: ProductGroup) => void;
}) {
  const out = group.stock <= 0;
  const single = group.variants.length === 1 ? group.variants[0] : null;
  const detail = single
    ? [single.size, single.color].filter(Boolean).join(" / ") || single.sku
    : `${group.variants.length} variantes`;
  return (
    <button
      type="button"
      disabled={out}
      onClick={() => onPick(group)}
      className={cn(
        "flex h-full min-h-24 w-full flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-[background-color,transform] outline-none select-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]",
        out && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="line-clamp-2 text-sm leading-snug font-medium">{group.name}</span>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
      <span className="mt-auto flex w-full items-end justify-between gap-2 pt-1">
        <span className="tabular text-sm font-semibold">
          {formatMoney(group.minPrice)}
          {group.maxPrice !== group.minPrice && <span className="font-normal text-muted-foreground">+</span>}
        </span>
        <span
          className={cn(
            "tabular text-[11px]",
            out ? "font-medium text-destructive" : group.stock <= 3 ? "text-warning" : "text-muted-foreground",
          )}
        >
          {out ? "Agotado" : `${group.stock} disp.`}
        </span>
      </span>
    </button>
  );
});
