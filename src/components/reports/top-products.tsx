"use client";
import * as React from "react";
import { formatBps, formatMoney } from "@/domain/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ProductStat, Report } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Mode = "revenue" | "units" | "variants";

export function TopProducts({ report, limit = 10 }: { report: Report; limit?: number }) {
  const [mode, setMode] = React.useState<Mode>("revenue");
  const rows: ProductStat[] = (
    mode === "revenue" ? report.productsByRevenue : mode === "units" ? report.productsByUnits : report.variants
  ).slice(0, limit);

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-label="Ordenar por">
        <ToggleGroupItem value="revenue" className="h-7 px-2.5 text-xs">Por venta</ToggleGroupItem>
        <ToggleGroupItem value="units" className="h-7 px-2.5 text-xs">Por unidades</ToggleGroupItem>
        <ToggleGroupItem value="variants" className="h-7 px-2.5 text-xs">Por variante</ToggleGroupItem>
      </ToggleGroup>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas en el periodo.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8">#</TableHead>
              <TableHead>{mode === "variants" ? "Variante" : "Producto"}</TableHead>
              <TableHead className="text-right">Unid.</TableHead>
              <TableHead className="text-right">Venta</TableHead>
              <TableHead className="text-right">Utilidad</TableHead>
              <TableHead className="text-right">Margen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p, i) => (
              <TableRow key={p.key}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="max-w-[16rem] whitespace-normal">
                  <div className="font-medium">{p.name}</div>
                  {mode === "variants" && (
                    <div className="text-xs text-muted-foreground">
                      {[p.variantLabel, p.sku].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", mode === "units" && "font-semibold")}>{p.units}</TableCell>
                <TableCell className={cn("text-right tabular-nums", mode !== "units" && "font-semibold")}>
                  {formatMoney(p.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(p.profit)}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    p.marginBps < 0 ? "text-destructive" : p.marginBps < 2000 ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {formatBps(p.marginBps)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
