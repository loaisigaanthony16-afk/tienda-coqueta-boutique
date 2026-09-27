"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { repo } from "@/data";
import type { InventoryMovement, VariantView } from "@/domain/types";
import { formatDateTime, variantLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MOVEMENT_LABEL } from "./inventory-utils";

export function HistoryDialog({
  variant,
  onOpenChange,
}: {
  variant: VariantView | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!variant} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-md">
        {variant && (
          <>
            <DialogHeader>
              <DialogTitle>Historial de stock</DialogTitle>
              <DialogDescription>
                {variant.productName}
                {variantLabel(variant) && ` · ${variantLabel(variant)}`}
                <span className="block font-mono text-xs">
                  {variant.sku} · stock actual {variant.stock}
                </span>
              </DialogDescription>
            </DialogHeader>
            <Timeline key={variant.id} variantId={variant.id} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: InventoryMovement[] };

function Timeline({ variantId }: { variantId: string }) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    let alive = true;
    repo()
      .listInventoryMovements({ variantId, limit: 200 })
      .then((items) => alive && setState({ status: "ready", items }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [variantId]);

  if (state.status === "loading") {
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state.status === "error") {
    return <p className="py-8 text-center text-sm text-destructive">No se pudo cargar el historial.</p>;
  }
  if (!state.items.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sin movimientos registrados.</p>;
  }

  return (
    <ol className="relative -mx-1 max-h-[60dvh] overflow-y-auto px-1">
      {state.items.map((m) => (
        <li key={m.id} className="group relative flex gap-3 pb-3 pl-4 last:pb-0">
          <span
            className={cn(
              "absolute top-1.5 left-0 size-2 rounded-full",
              m.quantity > 0 ? "bg-success" : "bg-destructive",
            )}
          />
          <span className="absolute top-4 bottom-0 left-[3px] w-px bg-border group-last:hidden" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{MOVEMENT_LABEL[m.type]}</span>
              <span
                className={cn(
                  "tabular text-sm font-semibold",
                  m.quantity > 0 ? "text-success" : "text-destructive",
                )}
              >
                {m.quantity > 0 ? "+" : "−"}{Math.abs(m.quantity)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span>{formatDateTime(m.createdAt)}</span>
              <span className="tabular">Queda {m.stockAfter}</span>
            </div>
            {m.note && <p className="mt-0.5 text-xs break-words text-muted-foreground italic">{m.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
