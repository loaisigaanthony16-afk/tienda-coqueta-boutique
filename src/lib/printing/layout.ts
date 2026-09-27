/**
 * Motor de diseño de tickets. Puro: produce un documento de líneas de ancho
 * fijo (32 columnas en 58 mm, 48 en 80 mm) que luego se codifica a ESC/POS o
 * se dibuja en HTML para window.print().
 */
import type { RegisterSummary } from "@/domain/cash";
import { formatBps, formatPlain } from "@/domain/money";
import { PAYMENT_LABEL } from "@/domain/payment";
import type { CashRegister, Cents, PaymentMethod, SaleWithItems } from "@/domain/types";
import { STORE } from "@/lib/config";
import { sanitizeForCharset, type Charset } from "./codepage";

export type PaperWidth = 58 | 80;
export type Align = "left" | "center" | "right";

export type DocLine =
  | {
      type: "text";
      /** Texto ya ajustado al ancho (en columnas del tamaño indicado). */
      text: string;
      align?: Align;
      bold?: boolean;
      /** 2 = doble ancho y alto (ocupa la mitad de columnas). */
      size?: 1 | 2;
    }
  | { type: "feed"; lines: number }
  | { type: "qr"; data: string }
  | { type: "barcode"; data: string };

export interface PrintDoc {
  paperWidth: PaperWidth;
  columns: number;
  lines: DocLine[];
}

export type SaleCode = "none" | "qr" | "barcode";

export function columnsFor(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}

// ---------------------------------------------------------------------------
// Utilidades de texto

/** Ajuste de línea por palabras; corta palabras más largas que el ancho. */
export function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const out: string[] = [];
  let line = "";
  for (let word of words) {
    while (word.length > width) {
      if (line) {
        const room = width - line.length - 1;
        if (room >= 3) {
          out.push(`${line} ${word.slice(0, room)}`);
          word = word.slice(room);
        } else out.push(line);
        line = "";
        continue;
      }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Izquierda + derecha en una línea. Si no caben, la izquierda se ajusta en
 * varias líneas y la derecha queda alineada en la última.
 */
export function twoCols(left: string, right: string, width: number): string[] {
  const minGap = 1;
  if (left.length + minGap + right.length <= width) {
    return [left + " ".repeat(width - left.length - right.length) + right];
  }
  const leftWidth = Math.max(1, width - right.length - minGap);
  const parts = wrap(left, leftWidth);
  const last = parts.pop()!;
  return [...parts, last + " ".repeat(width - last.length - right.length) + right];
}

export function center(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return (" ".repeat(pad) + text).padEnd(width).slice(0, Math.max(width, text.length));
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

/** "27/09/2026 14:05" en hora local; determinista (sin Intl). */
export function formatTicketDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const money = (c: Cents) => formatPlain(c);

// ---------------------------------------------------------------------------
// Constructor de documentos

export class DocBuilder {
  readonly lines: DocLine[] = [];
  readonly columns: number;

  constructor(
    readonly paperWidth: PaperWidth,
    readonly charset: Charset,
  ) {
    this.columns = columnsFor(paperWidth);
  }

  private clean(text: string) {
    return sanitizeForCharset(text, this.charset);
  }

  /** Párrafo ajustado al ancho. */
  text(text: string, opts: { align?: Align; bold?: boolean; size?: 1 | 2; indent?: number } = {}) {
    const size = opts.size ?? 1;
    const indent = opts.indent ?? 0;
    const width = Math.floor(this.columns / size);
    for (const line of wrap(this.clean(text), width - indent)) {
      this.lines.push({ type: "text", text: " ".repeat(indent) + line, align: opts.align ?? "left", bold: opts.bold, size });
    }
    return this;
  }

  center(text: string, opts: { bold?: boolean; size?: 1 | 2 } = {}) {
    return this.text(text, { ...opts, align: "center" });
  }

  /** Etiqueta a la izquierda y valor a la derecha. */
  pair(left: string, right: string, opts: { bold?: boolean; size?: 1 | 2 } = {}) {
    const size = opts.size ?? 1;
    const width = Math.floor(this.columns / size);
    for (const line of twoCols(this.clean(left), this.clean(right), width)) {
      this.lines.push({ type: "text", text: line, align: "left", bold: opts.bold, size });
    }
    return this;
  }

  rule(char = "-") {
    this.lines.push({ type: "text", text: char.repeat(this.columns), align: "left" });
    return this;
  }

  feed(lines = 1) {
    this.lines.push({ type: "feed", lines });
    return this;
  }

  qr(data: string) {
    this.lines.push({ type: "qr", data });
    return this;
  }

  barcode(data: string) {
    this.lines.push({ type: "barcode", data: toAsciiCode(data) });
    return this;
  }

  build(): PrintDoc {
    return { paperWidth: this.paperWidth, columns: this.columns, lines: this.lines };
  }
}

function toAsciiCode(data: string) {
  return data.replace(/[^\x20-\x7e]/g, "");
}

function storeHeader(b: DocBuilder) {
  b.center(STORE.name, { bold: true, size: 2 });
  if (STORE.legalName && STORE.legalName !== STORE.name) b.center(STORE.legalName);
  if (STORE.taxId) b.center(STORE.taxId);
  if (STORE.address) b.center(STORE.address);
  if (STORE.phone) b.center(`Tel. ${STORE.phone}`);
}

export function saleNumberLabel(n: number) {
  return n.toString().padStart(6, "0");
}

// ---------------------------------------------------------------------------
// Ticket de venta

export interface ReceiptLayoutOptions {
  paperWidth: PaperWidth;
  charset: Charset;
  cashierName?: string;
  /** "COPIA", "REIMPRESIÓN"… */
  copyLabel?: string;
  saleCode?: SaleCode;
}

export function layoutReceipt(sale: SaleWithItems, opts: ReceiptLayoutOptions): PrintDoc {
  const b = new DocBuilder(opts.paperWidth, opts.charset);
  storeHeader(b);
  b.feed(1);

  if (opts.copyLabel) b.center(`*** ${opts.copyLabel.toUpperCase()} ***`, { bold: true });
  if (sale.status === "voided") b.center("*** ANULADA ***", { bold: true, size: 2 });

  b.rule();
  b.pair("Ticket", `#${saleNumberLabel(sale.number)}`, { bold: true });
  b.pair("Fecha", formatTicketDate(sale.createdAt));
  if (opts.cashierName) b.pair("Cajero", opts.cashierName);
  b.pair("Cliente", sale.customerName?.trim() || "Consumidor final");
  b.rule();

  for (const item of sale.items) {
    const name = [item.productName, item.variantLabel].filter(Boolean).join(" ");
    b.text(name);
    const gross = item.quantity * item.unitPrice;
    b.pair(`  ${item.quantity} x ${money(item.unitPrice)}`, money(gross));
    if (item.discount > 0) b.pair("  Descuento", `-${money(item.discount)}`);
  }
  b.rule();

  b.pair("Subtotal", money(sale.subtotal));
  if (sale.discountTotal > 0) b.pair("Descuentos", `-${money(sale.discountTotal)}`);
  const rate = formatBps(STORE.taxRateBps);
  b.pair(STORE.pricesIncludeTax ? `IVA incluido ${rate}` : `IVA ${rate}`, money(sale.taxTotal));
  // En 58 mm el total en doble tamaño no siempre cabe: se usa negrita.
  const totalRight = `${STORE.currency === "USD" ? "$" : ""}${money(sale.total)}`;
  if (6 + 1 + totalRight.length <= Math.floor(b.columns / 2)) b.pair("TOTAL", totalRight, { bold: true, size: 2 });
  else b.pair("TOTAL", totalRight, { bold: true });
  b.rule();

  const methods = new Set<PaymentMethod>();
  for (const p of sale.payments) {
    methods.add(p.method);
    b.pair(PAYMENT_LABEL[p.method], money(p.amount));
    if (p.reference) b.text(`Ref: ${p.reference}`, { indent: 2 });
  }
  const tendered = sale.payments
    .filter((p) => p.method === "cash")
    .reduce((a, p) => a + (p.tendered ?? p.amount), 0);
  if (methods.has("cash")) {
    b.pair("Efectivo recibido", money(tendered));
    b.pair("Vuelto", money(sale.change), { bold: true });
  }

  if (sale.status === "voided") {
    b.rule();
    b.center("VENTA ANULADA", { bold: true });
    if (sale.voidedAt) b.center(formatTicketDate(sale.voidedAt));
    if (sale.voidReason) b.center(`Motivo: ${sale.voidReason}`);
  }

  b.feed(1);
  if (opts.saleCode === "qr") b.qr(`VENTA-${saleNumberLabel(sale.number)}`);
  else if (opts.saleCode === "barcode") b.barcode(saleNumberLabel(sale.number));
  if (STORE.receiptFooter) b.center(STORE.receiptFooter);
  return b.build();
}

// ---------------------------------------------------------------------------
// Corte X / Z

export interface RegisterReportLayoutInput {
  kind: "X" | "Z";
  register: CashRegister;
  summary: RegisterSummary;
  cashierName?: string;
  /** Momento de impresión (por defecto, ahora). */
  printedAt?: string;
}

export function layoutRegisterReport(
  input: RegisterReportLayoutInput,
  opts: { paperWidth: PaperWidth; charset: Charset },
): PrintDoc {
  const { kind, register: r, summary: s } = input;
  const b = new DocBuilder(opts.paperWidth, opts.charset);
  storeHeader(b);
  b.feed(1);
  b.center(kind === "X" ? "CORTE X" : "CORTE Z", { bold: true, size: 2 });
  b.center(kind === "X" ? "Parcial - la caja sigue abierta" : "Cierre de caja");
  b.rule();
  b.pair("Apertura", formatTicketDate(r.openedAt));
  if (r.closedAt) b.pair("Cierre", formatTicketDate(r.closedAt));
  b.pair("Impreso", formatTicketDate(input.printedAt ?? new Date().toISOString()));
  if (input.cashierName) b.pair("Cajero", input.cashierName);
  b.rule();

  b.center("EFECTIVO", { bold: true });
  b.pair("Fondo inicial", money(s.openingAmount));
  b.pair("Ventas en efectivo", money(s.cashSales));
  b.pair("Entradas", money(s.cashIn));
  b.pair("Salidas", `-${money(s.cashOut)}`);
  b.pair("Esperado en caja", money(s.expectedCash), { bold: true });
  const counted = r.countedAmount;
  if (counted !== null) {
    const expected = r.expectedAmount ?? s.expectedCash;
    const diff = r.difference ?? counted - expected;
    b.pair("Contado", money(counted));
    b.pair(diff < 0 ? "Diferencia (faltante)" : diff > 0 ? "Diferencia (sobrante)" : "Diferencia", money(diff), {
      bold: true,
    });
  }
  b.rule();

  b.center("POR MÉTODO DE PAGO", { bold: true });
  for (const m of Object.keys(PAYMENT_LABEL) as PaymentMethod[]) {
    b.pair(PAYMENT_LABEL[m], money(s.byMethod[m] ?? 0));
  }
  b.rule();

  b.center("VENTAS", { bold: true });
  b.pair("Ventas completadas", String(s.salesCount));
  b.pair("Ventas anuladas", String(s.voidedCount));
  b.pair("Venta bruta", money(s.grossSales));
  b.pair("Descuentos", `-${money(s.discountTotal)}`);
  b.pair(`IVA ${formatBps(STORE.taxRateBps)}`, money(s.taxTotal));
  if (r.notes) {
    b.rule();
    b.text(`Notas: ${r.notes}`);
  }
  b.feed(2);
  b.center("_".repeat(Math.min(24, b.columns - 4)));
  b.center("Firma del cajero");
  return b.build();
}

// ---------------------------------------------------------------------------
// Prueba de impresión

export function layoutTestPage(opts: { paperWidth: PaperWidth; charset: Charset; transportLabel: string }): PrintDoc {
  const b = new DocBuilder(opts.paperWidth, opts.charset);
  storeHeader(b);
  b.feed(1);
  b.center("PRUEBA DE IMPRESIÓN", { bold: true });
  b.rule();
  b.pair("Conexión", opts.transportLabel);
  b.pair("Papel", `${opts.paperWidth} mm (${b.columns} col.)`);
  b.pair("Caracteres", opts.charset.toUpperCase());
  b.pair("Fecha", formatTicketDate(new Date().toISOString()));
  b.rule();
  b.text("Acentos: á é í ó ú ü ñ Ñ ¿? ¡!");
  b.text("0123456789".repeat(Math.ceil(b.columns / 10)).slice(0, b.columns));
  b.pair("Izquierda", "Derecha");
  b.center("Centrado");
  b.text("Negrita", { bold: true });
  b.text("Doble", { size: 2 });
  b.rule();
  b.center("Si lees esto, la impresora funciona.");
  return b.build();
}

// ---------------------------------------------------------------------------
// Vista previa en texto plano (pruebas y depuración)

/** Renderiza el documento como texto monoespaciado, con alineación aplicada. */
export function docToPlainText(doc: PrintDoc): string {
  const out: string[] = [];
  for (const line of doc.lines) {
    if (line.type === "feed") for (let i = 0; i < line.lines; i++) out.push("");
    else if (line.type === "qr") out.push(center(`[QR ${line.data}]`, doc.columns).trimEnd());
    else if (line.type === "barcode") out.push(center(`[||| ${line.data} |||]`, doc.columns).trimEnd());
    else {
      const size = line.size ?? 1;
      const width = Math.floor(doc.columns / size);
      let text = line.text;
      if (line.align === "center") text = center(text, width);
      else if (line.align === "right") text = text.padStart(width);
      if (size === 2) text = text.split("").join(" ");
      out.push(text.trimEnd());
    }
  }
  return out.join("\n");
}
