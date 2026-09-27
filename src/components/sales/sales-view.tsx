"use client";
import * as React from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, ReceiptText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/domain/money";
import { PAYMENT_LABEL } from "@/domain/payment";
import type { PaymentMethod, SaleStatus, SaleWithItems } from "@/domain/types";
import { repo } from "@/data";
import { formatDate, formatTime } from "@/lib/format";
import { RangePicker } from "@/components/reports/range-picker";
import { presetRange, rangeLabel, toDateRange, type RangeValue } from "@/components/reports/range";
import { cn } from "@/lib/utils";
import { MethodBadges, StatusBadge } from "./sale-badges";
import { SaleDetailSheet } from "./sale-detail-sheet";
import { useCashierName } from "./use-profiles";

type StatusFilter = "all" | SaleStatus;
type MethodFilter = "all" | PaymentMethod;

const itemCount = (s: SaleWithItems) => s.items.reduce((a, i) => a + i.quantity, 0);

export function SalesView() {
  const [range, setRange] = React.useState<RangeValue>(() => presetRange("today"));
  const dr = React.useMemo(() => toDateRange(range), [range]);
  const key = `${dr.from}|${dr.to}`;
  const [data, setData] = React.useState<{ key: string; sales: SaleWithItems[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [method, setMethod] = React.useState<MethodFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const cashierName = useCashierName();
  const loading = data?.key !== key;

  React.useEffect(() => {
    let alive = true;
    repo()
      .listSales({ range: dr })
      .then((sales) => {
        if (!alive) return;
        setError(null);
        setData({ key: `${dr.from}|${dr.to}`, sales });
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar las ventas.");
      });
    return () => {
      alive = false;
    };
  }, [dr]);

  const sales = data?.sales;
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return (sales ?? []).filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (method !== "all" && !s.payments.some((p) => p.method === method)) return false;
      if (!q) return true;
      return (
        String(s.number).includes(q) ||
        (s.customerName ?? "").toLowerCase().includes(q) ||
        cashierName(s.cashierId).toLowerCase().includes(q) ||
        s.items.some((i) => i.sku.toLowerCase().includes(q) || i.productName.toLowerCase().includes(q))
      );
    });
  }, [sales, query, status, method, cashierName]);

  const totals = React.useMemo(() => {
    const done = filtered.filter((s) => s.status === "completed");
    return { count: done.length, total: done.reduce((a, s) => a + s.total, 0), voided: filtered.length - done.length };
  }, [filtered]);

  const selected = React.useMemo(
    () => (selectedId ? (sales ?? []).find((s) => s.id === selectedId) ?? null : null),
    [sales, selectedId],
  );

  function onVoided(updated: SaleWithItems) {
    setData((d) => (d ? { ...d, sales: d.sales.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)) } : d));
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const { exportSalesExcel } = await import("@/lib/export/excel");
      await exportSalesExcel(filtered, { cashierName, label: rangeLabel(range) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  const multiDay = range.from !== range.to;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            {rangeLabel(range)}
            {data && (
              <>
                {" · "}
                <span className="tabular-nums">{totals.count}</span> {totals.count === 1 ? "venta" : "ventas"} ·{" "}
                <span className="font-medium text-foreground tabular-nums">{formatMoney(totals.total)}</span>
                {totals.voided > 0 && ` · ${totals.voided} anulada${totals.voided === 1 ? "" : "s"}`}
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={exporting || !filtered.length}>
          {exporting ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel
        </Button>
      </header>

      <RangePicker value={range} onChange={setRange} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número, cliente, cajero o SKU"
            className="pl-8"
            aria-label="Buscar ventas"
          />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="completed">Completadas</SelectItem>
              <SelectItem value="voided">Anuladas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={(v) => setMethod(v as MethodFilter)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Método de pago">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los métodos</SelectItem>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive">{error}</div>
      )}

      {!data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          <ReceiptText className="size-6" />
          {sales?.length ? "Ninguna venta coincide con los filtros." : "No hay ventas en este periodo."}
        </div>
      ) : (
        <div className={cn("transition-opacity", loading && "pointer-events-none opacity-60")} aria-busy={loading}>
          {/* Escritorio */}
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>#</TableHead>
                  <TableHead>{multiDay ? "Fecha" : "Hora"}</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead className="text-right">Art.</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setSelectedId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(s.id);
                      }
                    }}
                  >
                    <TableCell className="font-medium tabular-nums">#{s.number}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {multiDay ? `${formatDate(s.createdAt)} ${formatTime(s.createdAt)}` : formatTime(s.createdAt)}
                    </TableCell>
                    <TableCell>
                      {cashierName(s.cashierId)}
                      {s.customerName && <div className="text-xs text-muted-foreground">{s.customerName}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{itemCount(s)}</TableCell>
                    <TableCell>
                      <MethodBadges payments={s.payments} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        s.status === "voided" && "text-muted-foreground line-through",
                      )}
                    >
                      {formatMoney(s.total)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Móvil */}
          <ul className="flex flex-col divide-y rounded-xl border md:hidden">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">#{s.number}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {multiDay ? `${formatDate(s.createdAt)} ` : ""}
                        {formatTime(s.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {cashierName(s.cashierId)} · {itemCount(s)} art.
                    </div>
                    <div className="mt-1">
                      <MethodBadges payments={s.payments} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        s.status === "voided" && "text-muted-foreground line-through",
                      )}
                    >
                      {formatMoney(s.total)}
                    </span>
                    {s.status === "voided" && <StatusBadge status={s.status} />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SaleDetailSheet
        sale={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelectedId(null)}
        cashierName={cashierName}
        onVoided={onVoided}
      />
    </div>
  );
}
