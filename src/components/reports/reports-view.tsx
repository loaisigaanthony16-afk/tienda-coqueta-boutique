"use client";
import * as React from "react";
import { toast } from "sonner";
import { DollarSign, FileSpreadsheet, FileText, Loader2, Percent, Receipt, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBps, formatMoney } from "@/domain/money";
import type { SaleWithItems } from "@/domain/types";
import { repo } from "@/data";
import {
  analyze, buildCatalogLookup, inRange, previousRange, WEEKDAY_LONG, WEEKDAY_SHORT,
} from "@/lib/analytics";
import { STORE } from "@/lib/config";
import { useCatalog } from "@/stores/catalog";
import { useIsAdmin } from "@/stores/session";
import { useCashierName } from "@/components/sales/use-profiles";
import { BarChart, HBarList, PaymentSplit, WeekHourHeatmap, type BarPoint } from "./charts";
import { KpiCard } from "./kpi-card";
import { LowStockCallout } from "./low-stock";
import { RangePicker } from "./range-picker";
import { parseLocalDate, presetRange, rangeLabel, toDateRange, type RangeValue } from "./range";
import { TopProducts } from "./top-products";

const dayTitle = new Intl.DateTimeFormat(STORE.locale, { weekday: "short", day: "numeric", month: "short" });

export function ReportsView() {
  const isAdmin = useIsAdmin();
  const [range, setRange] = React.useState<RangeValue>(() => presetRange("7d"));
  const dr = React.useMemo(() => toDateRange(range), [range]);
  const key = `${dr.from}|${dr.to}`;
  const [data, setData] = React.useState<{ key: string; sales: SaleWithItems[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState<"xlsx" | "pdf" | null>(null);
  const loading = data?.key !== key;

  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    // Una sola consulta cubre el periodo actual y el anterior (misma duración).
    const prev = previousRange(dr);
    repo()
      .listSales({ range: { from: prev.from, to: dr.to } })
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
  }, [dr, isAdmin]);

  const views = useCatalog((s) => s.views);
  const categories = useCatalog((s) => s.categories);
  const lookup = React.useMemo(() => buildCatalogLookup(views, categories), [views, categories]);
  const cashierName = useCashierName();

  const sales = data?.sales;
  const analysis = React.useMemo(() => (sales ? analyze(sales, dr, lookup) : null), [sales, dr, lookup]);
  const periodSales = React.useMemo(() => (sales ?? []).filter((s) => inRange(s.createdAt, dr)), [sales, dr]);
  const label = rangeLabel(range);

  async function doExport(kind: "xlsx" | "pdf") {
    if (!analysis) return;
    setExporting(kind);
    try {
      const input = {
        report: analysis.current,
        comparison: analysis.comparison,
        sales: periodSales,
        label,
        cashierName,
      };
      if (kind === "xlsx") {
        const { exportReportExcel } = await import("@/lib/export/excel");
        await exportReportExcel(input);
      } else {
        const { exportReportPdf } = await import("@/lib/export/pdf");
        await exportReportPdf(input);
      }
      toast.success(kind === "xlsx" ? "Excel generado" : "PDF generado");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExporting(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-sm text-muted-foreground">
        Esta sección es solo para administradores.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!analysis || !!exporting} onClick={() => doExport("xlsx")}>
            {exporting === "xlsx" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel
          </Button>
          <Button variant="outline" size="sm" disabled={!analysis || !!exporting} onClick={() => doExport("pdf")}>
            {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} PDF
          </Button>
        </div>
      </header>

      <RangePicker value={range} onChange={setRange} />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive">{error}</div>
      )}

      {!analysis ? (
        <ReportSkeleton />
      ) : (
        <div className={loading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <ReportBody analysis={analysis} />
        </div>
      )}
    </div>
  );
}

function ReportBody({ analysis }: { analysis: NonNullable<ReturnType<typeof analyze>> }) {
  const { current: r, comparison: c } = analysis;
  const s = r.summary;
  const multiDay = r.byDay.length > 1;

  const dayPoints = React.useMemo<BarPoint[]>(
    () =>
      r.byDay.map((d) => {
        const date = parseLocalDate(d.date);
        return {
          key: d.date,
          tick: r.byDay.length > 14 ? String(date.getDate()) : WEEKDAY_SHORT[date.getDay()] + " " + date.getDate(),
          value: d.total,
          title: dayTitle.format(date),
          detail: `${d.tickets} ${d.tickets === 1 ? "ticket" : "tickets"}`,
        };
      }),
    [r.byDay],
  );

  const hourPoints = React.useMemo<BarPoint[]>(() => {
    const withData = r.byHour.filter((h) => h.tickets > 0).map((h) => h.index);
    const lo = Math.min(9, ...withData);
    const hi = Math.max(19, ...withData);
    return r.byHour.slice(lo, hi + 1).map((h) => ({
      key: String(h.index),
      tick: `${h.index}h`,
      value: h.total,
      title: `${h.index}:00 – ${h.index + 1}:00`,
      detail: `${h.tickets} ${h.tickets === 1 ? "ticket" : "tickets"}`,
    }));
  }, [r.byHour]);

  const bestWeekday = React.useMemo(() => {
    const best = [...r.byWeekday].sort((a, b) => b.total - a.total)[0];
    return best && best.total > 0 ? WEEKDAY_LONG[best.index] : null;
  }, [r.byWeekday]);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
        <KpiCard
          title="Ventas del periodo"
          icon={<DollarSign />}
          value={formatMoney(s.gross)}
          sub={`${s.tickets} tickets · ${s.units} unidades · neto ${formatMoney(s.net)}`}
          delta={c.gross}
        />
        <KpiCard
          title="Margen neto"
          icon={<Percent />}
          value={
            <>
              {formatMoney(s.profit)} <span className="text-base font-medium text-muted-foreground">{formatBps(s.marginBps)}</span>
            </>
          }
          sub={`Utilidad sobre venta sin IVA · costo ${formatMoney(s.cost)}`}
          delta={c.profit}
        />
        <KpiCard
          title="Ticket promedio"
          icon={<Receipt />}
          value={formatMoney(s.avgTicket)}
          sub={s.tickets ? `${(s.units / s.tickets).toFixed(1)} artículos por ticket` : "Sin ventas"}
          delta={c.avgTicket}
        />
        <KpiCard
          title="Producto estrella"
          icon={<Star />}
          value={c.star ? <span className="text-xl">{c.star.name}</span> : "—"}
          sub={c.star ? `${formatMoney(c.star.revenue)} · ${c.star.units} unidades` : "Sin ventas en el periodo"}
          delta={c.star?.delta}
        />
      </section>

      <LowStockCallout />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{multiDay ? "Ventas por día" : "Ventas por hora"}</CardTitle>
            <CardDescription>
              {multiDay
                ? `Total con IVA · promedio diario ${formatMoney(Math.round(s.gross / r.byDay.length))}`
                : "Total con IVA por franja horaria"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              points={multiDay ? dayPoints : hourPoints}
              ariaLabel={multiDay ? "Ventas por día" : "Ventas por hora"}
              height={220}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Métodos de pago</CardTitle>
            <CardDescription>Monto cobrado por método</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <PaymentSplit byMethod={r.byMethod} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-4 text-sm">
              <dt className="text-muted-foreground">Venta neta (sin IVA)</dt>
              <dd className="text-right tabular-nums">{formatMoney(s.net)}</dd>
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="text-right tabular-nums">{formatMoney(s.tax)}</dd>
              <dt className="text-muted-foreground">Costo de lo vendido</dt>
              <dd className="text-right tabular-nums">{formatMoney(s.cost)}</dd>
              <dt className="text-muted-foreground">Descuentos</dt>
              <dd className="text-right tabular-nums">{formatMoney(s.discounts)}</dd>
              <dt className="text-muted-foreground">Anuladas</dt>
              <dd className="text-right tabular-nums">
                {s.voidedCount} {s.voidedCount > 0 && <span className="text-muted-foreground">({formatMoney(s.voidedTotal)})</span>}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {r.byDay.length >= 7 ? (
          <Card>
            <CardHeader>
              <CardTitle>¿Cuándo se vende?</CardTitle>
              <CardDescription>
                Día de la semana × hora{bestWeekday ? ` · mejor día: ${bestWeekday}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeekHourHeatmap heat={r.heat} />
            </CardContent>
          </Card>
        ) : multiDay ? (
          <Card>
            <CardHeader>
              <CardTitle>Ventas por hora</CardTitle>
              <CardDescription>Acumulado del periodo</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart points={hourPoints} ariaLabel="Ventas por hora" height={200} />
            </CardContent>
          </Card>
        ) : null}

        <Card className={r.byDay.length >= 2 ? undefined : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle>Ventas por categoría</CardTitle>
            <CardDescription>Participación en la venta del periodo</CardDescription>
          </CardHeader>
          <CardContent>
            <HBarList
              rows={r.categories.map((k) => ({
                key: k.id ?? "none",
                label: k.name,
                value: k.revenue,
                sub: `${k.units} u. · ${formatBps(k.shareBps)}`,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 productos</CardTitle>
          <CardDescription>Venta con IVA; utilidad y margen sobre venta neta</CardDescription>
        </CardHeader>
        <CardContent>
          <TopProducts report={r} />
        </CardContent>
      </Card>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
