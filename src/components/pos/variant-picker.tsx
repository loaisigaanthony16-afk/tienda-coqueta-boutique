"use client";
import * as React from "react";
import { sortSizes } from "@/domain/codes";
import { formatMoney } from "@/domain/money";
import type { VariantView } from "@/domain/types";
import { useCatalog } from "@/stores/catalog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { addToCart } from "./cart-actions";
import type { ProductGroup } from "./product-browser";

const NONE = "—";

/** Selector rápido talla × color con el stock de cada combinación. */
export function VariantPicker({
  group,
  onOpenChange,
  onDone,
}: {
  group: ProductGroup | null;
  onOpenChange: (open: boolean) => void;
  /** Tras agregar: devolver el foco al buscador. */
  onDone: () => void;
}) {
  // Stock siempre fresco del catálogo (puede cambiar tras una venta).
  const byId = useCatalog((s) => s.byId);
  const variants = React.useMemo(
    () => (group ? group.variants.map((v) => byId.get(v.id) ?? v).filter((v) => v.active) : []),
    [group, byId],
  );

  const sizes = React.useMemo(() => sortSizes([...new Set(variants.map((v) => v.size ?? NONE))]), [variants]);
  const colors = React.useMemo(
    () => [...new Set(variants.map((v) => v.color ?? NONE))].sort((a, b) => a.localeCompare(b, "es")),
    [variants],
  );
  const cell = React.useMemo(() => {
    const m = new Map<string, VariantView>();
    for (const v of variants) m.set(`${v.size ?? NONE}|${v.color ?? NONE}`, v);
    return m;
  }, [variants]);

  const basePrice = group?.minPrice ?? 0;
  const firstAvailable = variants.find((v) => v.stock > 0)?.id;

  const choose = (v: VariantView) => {
    if (addToCart(v)) onOpenChange(false);
  };

  const oneAxis = sizes.length === 1 || colors.length === 1;

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-5"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onDone();
        }}
      >
        <DialogHeader>
          <DialogTitle>{group?.name}</DialogTitle>
          <DialogDescription>
            Elige talla y color. {group?.brand ? `${group.brand} · ` : ""}
            {formatMoney(basePrice)}
          </DialogDescription>
        </DialogHeader>

        {oneAxis ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {variants
              .slice()
              .sort(
                (a, b) =>
                  sizes.indexOf(a.size ?? NONE) - sizes.indexOf(b.size ?? NONE) ||
                  colors.indexOf(a.color ?? NONE) - colors.indexOf(b.color ?? NONE),
              )
              .map((v) => (
                <VariantButton
                  key={v.id}
                  v={v}
                  label={[v.size, v.color].filter(Boolean).join(" / ") || v.sku}
                  basePrice={basePrice}
                  autoFocus={v.id === firstAvailable}
                  onChoose={choose}
                />
              ))}
          </div>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full border-separate border-spacing-1.5">
              <thead>
                <tr>
                  <th scope="col" className="w-14 text-left text-xs font-medium text-muted-foreground">
                    <span className="sr-only">Talla</span>
                  </th>
                  {colors.map((c) => (
                    <th key={c} scope="col" className="text-center text-xs font-medium text-muted-foreground">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizes.map((s) => (
                  <tr key={s}>
                    <th scope="row" className="text-left text-sm font-semibold">
                      {s}
                    </th>
                    {colors.map((c) => {
                      const v = cell.get(`${s}|${c}`);
                      return (
                        <td key={c}>
                          {v ? (
                            <VariantButton
                              v={v}
                              label={`${s} ${c}`}
                              compact
                              basePrice={basePrice}
                              autoFocus={v.id === firstAvailable}
                              onChoose={choose}
                            />
                          ) : (
                            <div className="h-14 rounded-md border border-dashed opacity-30" aria-hidden />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VariantButton({
  v,
  label,
  compact,
  basePrice,
  autoFocus,
  onChoose,
}: {
  v: VariantView;
  label: string;
  compact?: boolean;
  basePrice: number;
  autoFocus?: boolean;
  onChoose: (v: VariantView) => void;
}) {
  const out = v.stock <= 0;
  return (
    <button
      type="button"
      disabled={out}
      autoFocus={autoFocus}
      onClick={() => onChoose(v)}
      aria-label={`${label}: ${out ? "agotado" : `${v.stock} disponibles`}`}
      className={cn(
        "flex h-14 w-full min-w-16 flex-col items-center justify-center rounded-md border px-2 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        out
          ? "cursor-not-allowed bg-muted/40 text-muted-foreground line-through opacity-60"
          : "bg-background hover:border-primary hover:bg-muted active:scale-[0.98]",
      )}
    >
      {!compact && <span className="font-medium">{label}</span>}
      <span className={cn("tabular text-xs", compact && "text-sm font-medium", !out && v.stock <= 2 && "text-warning")}>
        {out ? "Agotado" : `${v.stock} disp.`}
      </span>
      {v.effectivePrice !== basePrice && (
        <span className="tabular text-[10px] text-muted-foreground">{formatMoney(v.effectivePrice)}</span>
      )}
    </button>
  );
}
