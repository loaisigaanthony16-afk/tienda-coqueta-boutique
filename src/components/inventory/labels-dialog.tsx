"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, Printer } from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { Product, ProductVariant } from "@/domain/types";
import { STORE } from "@/lib/config";
import { variantLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Ean13Svg } from "./ean13-svg";

export interface LabelsTarget {
  product: Product;
  variants: ProductVariant[];
}

export function LabelsDialog({
  target,
  onOpenChange,
}: {
  target: LabelsTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {target && <LabelsBody key={target.product.id} target={target} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LabelsBody({ target, onClose }: { target: LabelsTarget; onClose: () => void }) {
  const { product } = target;
  const variants = React.useMemo(() => target.variants.filter((v) => v.active), [target.variants]);
  const [qty, setQty] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(variants.map((v) => [v.id, 1])),
  );
  const total = variants.reduce((a, v) => a + (qty[v.id] ?? 0), 0);

  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(500, n)) }));
  const setAll = (f: (v: ProductVariant) => number) =>
    setQty(Object.fromEntries(variants.map((v) => [v.id, Math.max(0, Math.min(500, f(v)))])));

  const labels = variants.flatMap((v) => Array.from({ length: qty[v.id] ?? 0 }, (_, i) => ({ v, i })));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Etiquetas</DialogTitle>
        <DialogDescription>{product.name} · elige cuántas imprimir por variante.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setAll(() => 1)}>1 de cada una</Button>
        <Button size="sm" variant="outline" onClick={() => setAll((v) => v.stock)}>Según stock</Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(() => 0)}>Ninguna</Button>
      </div>

      {variants.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No hay variantes activas.</p>
      ) : (
        <ul className="-mx-1 max-h-[45dvh] divide-y overflow-y-auto px-1">
          {variants.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{variantLabel(v) || "Única"}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{v.barcode}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon-sm" variant="outline" aria-label="Menos" onClick={() => set(v.id, (qty[v.id] ?? 0) - 1)}>
                  <Minus />
                </Button>
                <span className="w-8 text-center text-sm tabular">{qty[v.id] ?? 0}</span>
                <Button size="icon-sm" variant="outline" aria-label="Más" onClick={() => set(v.id, (qty[v.id] ?? 0) + 1)}>
                  <Plus />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {variants[0] && (
        <div className="flex justify-center rounded-lg bg-muted/60 p-3">
          <Label50x30 product={product} variant={variants[0]} />
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button disabled={total === 0} onClick={() => window.print()}>
          <Printer />
          Imprimir {total} {total === 1 ? "etiqueta" : "etiquetas"}
        </Button>
      </DialogFooter>

      <PrintSheet>
        {labels.map(({ v, i }) => (
          <Label50x30 key={`${v.id}-${i}`} product={product} variant={v} />
        ))}
      </PrintSheet>
    </>
  );
}

/**
 * Hoja imprimible fuera del diálogo (portal directo en <body>), para que no la
 * recorte el overflow del modal. Mientras existe, oculta el resto al imprimir.
 */
function PrintSheet({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="labels-print-root print-area hidden print:block">
      <style>{`
        @media print {
          @page { margin: 6mm; }
          body > *:not(.labels-print-root) { display: none !important; }
          .labels-print-root { position: static !important; }
        }
      `}</style>
      <div className="flex flex-wrap content-start gap-[2mm]">{children}</div>
    </div>,
    document.body,
  );
}

function Label50x30({ product, variant }: { product: Product; variant: ProductVariant }) {
  const price = variant.price ?? product.basePrice;
  const label = variantLabel(variant);
  return (
    <div
      className="flex flex-col overflow-hidden rounded-[1mm] border border-black/30 bg-white text-black print:break-inside-avoid"
      style={{ width: "50mm", height: "30mm", padding: "1.5mm 2mm" }}
    >
      <div className="flex items-baseline justify-between gap-1 leading-none">
        <span className="truncate text-[6pt] tracking-wide uppercase">{STORE.shortName}</span>
        <span className="font-mono text-[5.5pt]">{variant.sku}</span>
      </div>
      <div className="mt-[0.8mm] truncate text-[7.5pt] leading-tight font-semibold">{product.name}</div>
      <div className="flex items-baseline justify-between gap-1 leading-tight">
        <span className="truncate text-[7pt]">{label}</span>
        <span className="text-[10pt] font-bold tabular">{formatMoney(price)}</span>
      </div>
      <Ean13Svg value={variant.barcode} height={30} className="mt-auto h-[13mm] w-full" />
    </div>
  );
}
