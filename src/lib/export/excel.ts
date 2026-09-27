/**
 * Exportaciones a Excel. `xlsx` se importa dinámicamente dentro de cada
 * función para no inflar el bundle inicial.
 * Los montos se escriben como número en unidades de moneda (cents / 100)
 * para que la hoja pueda sumarlos.
 */
import { PAYMENT_LABEL } from "@/domain/payment";
import type { SaleWithItems } from "@/domain/types";
import type { Comparison, Report } from "@/lib/analytics";
import { STORE } from "@/lib/config";
import { formatDateTime } from "@/lib/format";

type Cell = string | number | null;

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** Anchos de columna en caracteres. */
  widths?: number[];
}

const money = (cents: number) => Math.round(cents) / 100;
const pct = (bps: number) => bps / 10000;

export async function downloadWorkbook(filename: string, sheets: SheetSpec[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.widths) ws["!cols"] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

const methodsText = (s: SaleWithItems) =>
  s.payments.map((p) => `${PAYMENT_LABEL[p.method]} ${money(p.amount).toFixed(2)}`).join(" + ");

const statusText = (s: SaleWithItems) => (s.status === "completed" ? "Completada" : "Anulada");

function salesRows(sales: SaleWithItems[], cashierName: (id: string) => string): Cell[][] {
  return [
    ["#", "Fecha", "Cajero", "Cliente", "Artículos", "Subtotal", "Descuento", "IVA", "Total", "Pagos", "Vuelto", "Estado", "Motivo anulación"],
    ...sales.map((s) => [
      s.number,
      formatDateTime(s.createdAt),
      cashierName(s.cashierId),
      s.customerName ?? "",
      s.items.reduce((a, i) => a + i.quantity, 0),
      money(s.subtotal),
      money(s.discountTotal),
      money(s.taxTotal),
      money(s.total),
      methodsText(s),
      money(s.change),
      statusText(s),
      s.voidReason ?? "",
    ]),
  ];
}

function detailRows(sales: SaleWithItems[]): Cell[][] {
  const rows: Cell[][] = [
    ["# Venta", "Fecha", "Estado", "Producto", "Variante", "SKU", "Cant.", "Precio unit.", "Descuento", "Total línea", "Costo unit.", "Costo total"],
  ];
  for (const s of sales) {
    for (const i of s.items) {
      rows.push([
        s.number, formatDateTime(s.createdAt), statusText(s), i.productName, i.variantLabel, i.sku,
        i.quantity, money(i.unitPrice), money(i.discount), money(i.lineTotal), money(i.unitCost),
        money(i.unitCost * i.quantity),
      ]);
    }
  }
  return rows;
}

/** Lista de ventas (página Ventas): hojas Ventas y Detalle. */
export async function exportSalesExcel(
  sales: SaleWithItems[],
  opts: { cashierName: (id: string) => string; label: string },
): Promise<void> {
  await downloadWorkbook(`ventas-${slug(opts.label)}`, [
    { name: "Ventas", rows: salesRows(sales, opts.cashierName), widths: [8, 18, 18, 18, 10, 11, 11, 10, 11, 34, 10, 12, 30] },
    { name: "Detalle", rows: detailRows(sales), widths: [8, 18, 12, 30, 18, 18, 7, 11, 11, 11, 11, 11] },
  ]);
}

/** Reporte completo: Resumen, Ventas, Detalle, Productos. */
export async function exportReportExcel(input: {
  report: Report;
  comparison: Comparison;
  sales: SaleWithItems[];
  label: string;
  cashierName: (id: string) => string;
}): Promise<void> {
  const { report: r, comparison: c, sales, label } = input;
  const s = r.summary;
  const d = (x: number | null) => (x === null ? "" : x / 100);
  const resumen: Cell[][] = [
    [STORE.name],
    ["Reporte de ventas", label],
    ["Generado", formatDateTime(new Date().toISOString())],
    [],
    ["Indicador", "Valor", "Periodo anterior", "Variación"],
    ["Ventas brutas (con IVA)", money(s.gross), money(c.gross.previous), d(c.gross.pct)],
    ["IVA", money(s.tax), "", ""],
    ["Ventas netas (sin IVA)", money(s.net), money(c.net.previous), d(c.net.pct)],
    ["Costo de lo vendido", money(s.cost), "", ""],
    ["Utilidad bruta", money(s.profit), money(c.profit.previous), d(c.profit.pct)],
    ["Margen (utilidad / venta neta)", pct(s.marginBps), pct(c.marginBps.previous), ""],
    ["Tickets", s.tickets, c.tickets.previous, d(c.tickets.pct)],
    ["Ticket promedio", money(s.avgTicket), money(c.avgTicket.previous), d(c.avgTicket.pct)],
    ["Unidades vendidas", s.units, c.units.previous, d(c.units.pct)],
    ["Descuentos otorgados", money(s.discounts), "", ""],
    ["Ventas anuladas", s.voidedCount, "", ""],
    [],
    ["Método de pago", "Monto"],
    ...(Object.keys(r.byMethod) as (keyof typeof r.byMethod)[]).map((m) => [PAYMENT_LABEL[m], money(r.byMethod[m])]),
    [],
    ["Categoría", "Unidades", "Venta", "Utilidad", "Participación"],
    ...r.categories.map((k) => [k.name, k.units, money(k.revenue), money(k.profit), pct(k.shareBps)]),
    [],
    ["Día", "Tickets", "Venta"],
    ...r.byDay.map((x) => [x.date, x.tickets, money(x.total)]),
  ];
  const productos: Cell[][] = [
    ["Producto", "Unidades", "Venta (con IVA)", "Venta neta", "Costo", "Utilidad", "Margen"],
    ...r.productsByRevenue.map((p) => [p.name, p.units, money(p.revenue), money(p.net), money(p.cost), money(p.profit), pct(p.marginBps)]),
    [],
    ["Variante", "SKU", "Unidades", "Venta (con IVA)", "Utilidad", "Margen"],
    ...r.variants.map((v) => [`${v.name}${v.variantLabel ? ` · ${v.variantLabel}` : ""}`, v.sku ?? "", v.units, money(v.revenue), money(v.profit), pct(v.marginBps)]),
  ];
  await downloadWorkbook(`reporte-${slug(label)}`, [
    { name: "Resumen", rows: resumen, widths: [32, 16, 16, 12, 12] },
    { name: "Ventas", rows: salesRows(sales, input.cashierName), widths: [8, 18, 18, 18, 10, 11, 11, 10, 11, 34, 10, 12, 30] },
    { name: "Detalle", rows: detailRows(sales), widths: [8, 18, 12, 30, 18, 18, 7, 11, 11, 11, 11, 11] },
    { name: "Productos", rows: productos, widths: [40, 18, 10, 14, 12, 12, 10] },
  ]);
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "export";
}
