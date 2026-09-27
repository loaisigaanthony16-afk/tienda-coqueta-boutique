"use client";
import * as React from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { repo, RepositoryError } from "@/data";
import type { VariantView } from "@/domain/types";
import { useCatalog } from "@/stores/catalog";
import { variantLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STOCK_TEXT, stockStatus } from "./inventory-utils";

type AdjustType = "purchase" | "adjustment" | "return";
type AdjustMode = "delta" | "count";

export function StockAdjustDialog({
  variant,
  onOpenChange,
}: {
  variant: VariantView | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!variant} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {variant && <AdjustForm key={variant.id} variant={variant} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ variant, onDone }: { variant: VariantView; onDone: () => void }) {
  const [type, setType] = React.useState<AdjustType>("purchase");
  const [mode, setMode] = React.useState<AdjustMode>("delta");
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const n = Math.trunc(Number(qty));
  const parsed = qty.trim() !== "" && Number.isFinite(n) ? n : null;
  let delta = 0;
  if (parsed != null) {
    if (type === "adjustment") delta = mode === "count" ? parsed - variant.stock : parsed;
    else delta = Math.abs(parsed);
  }
  const next = variant.stock + delta;
  const error =
    parsed == null ? null
    : type === "adjustment" && mode === "count" && parsed < 0 ? "El conteo no puede ser negativo."
    : delta === 0 ? "No hay cambio de stock."
    : next < 0 ? "El stock no puede quedar negativo."
    : null;
  const canSave = parsed != null && !error && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await repo().adjustStock({
        variantId: variant.id,
        delta,
        type,
        note: note.trim() || (type === "adjustment" && mode === "count" ? "Conteo físico" : null),
      });
      toast.success(`Stock actualizado: ${variant.stock} → ${next}`);
      await useCatalog.getState().load(true);
      onDone();
    } catch (err) {
      toast.error(err instanceof RepositoryError ? err.message : "No se pudo ajustar el stock.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Ajustar stock</DialogTitle>
        <DialogDescription>
          {variant.productName}
          {variantLabel(variant) && ` · ${variantLabel(variant)}`}
          <span className="block font-mono text-xs">{variant.sku}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label>Tipo de movimiento</Label>
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => v && setType(v as AdjustType)}
          className="grid grid-cols-3"
        >
          <ToggleGroupItem value="purchase" className="px-2 text-xs sm:text-sm">Compra</ToggleGroupItem>
          <ToggleGroupItem value="adjustment" className="px-2 text-xs sm:text-sm">Ajuste ±</ToggleGroupItem>
          <ToggleGroupItem value="return" className="px-2 text-xs sm:text-sm">Devolución</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {type === "adjustment" && (
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as AdjustMode)}
          className="grid grid-cols-2"
        >
          <ToggleGroupItem value="delta" className="h-8 text-xs">Sumar / restar</ToggleGroupItem>
          <ToggleGroupItem value="count" className="h-8 text-xs">Fijar conteo físico</ToggleGroupItem>
        </ToggleGroup>
      )}

      <div className="grid gap-2">
        <Label htmlFor="adj-qty">
          {type === "adjustment" ? (mode === "count" ? "Unidades contadas" : "Cantidad (usa − para restar)") : "Unidades que entran"}
        </Label>
        <Input
          id="adj-qty"
          autoFocus
          inputMode="numeric"
          type="number"
          step={1}
          className="tabular text-lg"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={type === "adjustment" && mode === "delta" ? "-2 o 5" : "0"}
          aria-invalid={!!error}
        />
      </div>

      <div className="flex items-center justify-center gap-4 rounded-lg bg-muted/60 py-3 tabular">
        <div className="text-center">
          <div className="text-[11px] text-muted-foreground">Actual</div>
          <div className={cn("text-xl", STOCK_TEXT[stockStatus(variant)])}>{variant.stock}</div>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          <ArrowRight className="mx-auto size-4" />
          {parsed != null && delta !== 0 && (
            <span className={delta > 0 ? "text-success" : "text-destructive"}>
              {delta > 0 ? "+" : "−"}{Math.abs(delta)}
            </span>
          )}
        </div>
        <div className="text-center">
          <div className="text-[11px] text-muted-foreground">Nuevo</div>
          <div
            className={cn(
              "text-xl font-semibold",
              parsed != null && STOCK_TEXT[stockStatus({ stock: next, minStock: variant.minStock })],
            )}
          >
            {parsed != null ? next : "—"}
          </div>
        </div>
      </div>
      {error && <p className="-mt-2 text-xs text-destructive">{error}</p>}

      <div className="grid gap-2">
        <Label htmlFor="adj-note">Nota</Label>
        <Textarea
          id="adj-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={type === "purchase" ? "Proveedor, factura…" : "Motivo del movimiento"}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={!canSave}>
          {saving && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
