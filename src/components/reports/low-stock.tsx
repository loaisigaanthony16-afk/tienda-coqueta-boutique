"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { variantLabel } from "@/lib/format";
import { useCatalog } from "@/stores/catalog";

export function LowStockCallout({ max = 8 }: { max?: number }) {
  const views = useCatalog((s) => s.views);
  const low = React.useMemo(
    () =>
      views
        .filter((v) => v.active && v.stock <= v.minStock)
        .sort((a, b) => a.stock - b.stock || a.productName.localeCompare(b.productName)),
    [views],
  );
  if (!low.length) return null;

  return (
    <section
      aria-label="Stock bajo"
      className="rounded-xl border border-warning/40 bg-warning/8 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-4 text-warning" aria-hidden />
        <h2 className="text-sm font-semibold">
          {low.length} {low.length === 1 ? "variante con stock bajo" : "variantes con stock bajo"}
        </h2>
        <Button asChild variant="ghost" size="sm" className="ml-auto h-7">
          <Link href="/inventario">
            Ver inventario <ArrowRight />
          </Link>
        </Button>
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {low.slice(0, max).map((v) => (
          <li key={v.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {v.productName}
              <span className="text-muted-foreground"> · {variantLabel(v) || v.sku}</span>
            </span>
            <Badge variant={v.stock <= 0 ? "destructive" : "warning"} className="tabular-nums">
              {v.stock <= 0 ? "Agotado" : `${v.stock} / mín. ${v.minStock}`}
            </Badge>
          </li>
        ))}
      </ul>
      {low.length > max && (
        <p className="mt-2 text-xs text-muted-foreground">y {low.length - max} más…</p>
      )}
    </section>
  );
}
