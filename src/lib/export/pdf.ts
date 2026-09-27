/**
 * Reporte en PDF (A4 vertical). `jspdf` y `jspdf-autotable` se importan
 * dinámicamente para no inflar el bundle inicial.
 */
import { formatBps, formatMoney } from "@/domain/money";
import { PAYMENT_LABEL } from "@/domain/payment";
import type { PaymentMethod, SaleWithItems } from "@/domain/types";
import type { Comparison, Delta, Report } from "@/lib/analytics";
import { STORE } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { slug } from "./excel";

/** Las fuentes estándar de PDF solo cubren WinAnsi: normaliza espacios raros. */
const t = (s: string) => s.replace(/[  ]/g, " ").replace(/−/g, "-");
const m = (c: number) => t(formatMoney(c));

function deltaText(d: Delta): string {
  if (d.pct === null) return "nuevo";
  const sign = d.pct > 0 ? "+" : "";
  return `${sign}${d.pct.toFixed(1)}% vs. anterior`;
}

export async function exportReportPdf(input: {
  report: Report;
  comparison: Comparison;
  sales: SaleWithItems[];
  label: string;
  cashierName: (id: string) => string;
}): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const { report: r, comparison: c, sales, label } = input;
  const s = r.summary;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const brand: [number, number, number] = [214, 74, 128];
  const ink: [number, number, number] = [30, 30, 30];
  const mute: [number, number, number] = [110, 110, 110];
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;

  // Encabezado
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...ink);
  doc.text(t(STORE.name), M, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...mute);
  doc.text(t(`Reporte de ventas · ${label}`), M, 22);
  doc.text(t(`Generado ${formatDateTime(new Date().toISOString())}`), W - M, 16, { align: "right" });
  doc.text(t(`${STORE.taxId} · ${STORE.address}`), W - M, 22, { align: "right" });

  // KPIs en 4 tarjetas
  const kpis: Array<[string, string, string]> = [
    ["Ventas del periodo", m(s.gross), deltaText(c.gross)],
    ["Utilidad bruta", `${m(s.profit)} (${formatBps(s.marginBps)})`, deltaText(c.profit)],
    ["Ticket promedio", m(s.avgTicket), `${s.tickets} tickets · ${deltaText(c.avgTicket)}`],
    ["Producto estrella", c.star ? t(c.star.name) : "—", c.star ? `${m(c.star.revenue)} · ${c.star.units} u.` : ""],
  ];
  const gap = 4;
  const cw = (W - 2 * M - gap * 3) / 4;
  const y0 = 30;
  kpis.forEach(([title, value, sub], i) => {
    const x = M + i * (cw + gap);
    doc.setDrawColor(225, 225, 225);
    doc.roundedRect(x, y0, cw, 24, 2, 2, "S");
    doc.setFontSize(8);
    doc.setTextColor(...mute);
    doc.text(t(title), x + 3, y0 + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.text(doc.splitTextToSize(t(value), cw - 6)[0] ?? "", x + 3, y0 + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...mute);
    doc.text(doc.splitTextToSize(t(sub), cw - 6)[0] ?? "", x + 3, y0 + 19);
  });

  // Resumen compacto
  const methods = (Object.keys(r.byMethod) as PaymentMethod[])
    .map((k) => `${PAYMENT_LABEL[k]} ${m(r.byMethod[k])}`)
    .join("   ");
  doc.setFontSize(8.5);
  doc.setTextColor(...ink);
  doc.text(
    t(`Neto sin IVA ${m(s.net)} · IVA ${m(s.tax)} · Costo ${m(s.cost)} · Descuentos ${m(s.discounts)} · Unidades ${s.units} · Anuladas ${s.voidedCount}`),
    M, y0 + 31,
  );
  doc.text(t(`Pagos: ${methods}`), M, y0 + 36);

  const tableBase = {
    margin: { left: M, right: M },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6, textColor: ink },
    headStyles: { fillColor: [245, 240, 243] as [number, number, number], textColor: ink, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [251, 250, 251] as [number, number, number] },
    theme: "plain" as const,
  };

  // Top productos
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Top 10 productos", M, y0 + 46);
  autoTable(doc, {
    ...tableBase,
    startY: y0 + 49,
    head: [["#", "Producto", "Unid.", "Venta", "Utilidad", "Margen"]],
    body: r.productsByRevenue.slice(0, 10).map((p, i) => [
      String(i + 1), t(p.name), String(p.units), m(p.revenue), m(p.profit), formatBps(p.marginBps),
    ]),
    columnStyles: { 0: { cellWidth: 8 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });

  // Categorías
  if (r.categories.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Ventas por categoría", M, lastY() + 9);
    autoTable(doc, {
      ...tableBase,
      startY: lastY() + 12,
      head: [["Categoría", "Unid.", "Venta", "Utilidad", "Part."]],
      body: r.categories.map((k) => [t(k.name), String(k.units), m(k.revenue), m(k.profit), formatBps(k.shareBps)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
  }

  // Lista de ventas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  let y = lastY() + 9;
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 18;
  }
  doc.text(`Ventas (${sales.length})`, M, y);
  autoTable(doc, {
    ...tableBase,
    startY: y + 3,
    head: [["#", "Fecha", "Cajero", "Art.", "Pagos", "Total", "Estado"]],
    body: sales.map((x) => [
      String(x.number),
      t(formatDateTime(x.createdAt)),
      t(input.cashierName(x.cashierId)),
      String(x.items.reduce((a, i) => a + i.quantity, 0)),
      x.payments.map((p) => PAYMENT_LABEL[p.method]).join(" + "),
      m(x.total),
      x.status === "completed" ? "OK" : "Anulada",
    ]),
    columnStyles: { 3: { halign: "right" }, 5: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.raw && (data.row.raw as string[])[6] === "Anulada") {
        data.cell.styles.textColor = [180, 40, 40];
      }
    },
  });

  // Pie con paginación
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...mute);
    const h = doc.internal.pageSize.getHeight();
    doc.text(t(`${STORE.name} · ${label}`), M, h - 8);
    doc.text(`Página ${i} de ${pages}`, W - M, h - 8, { align: "right" });
  }

  doc.save(`reporte-${slug(label)}.pdf`);
}
