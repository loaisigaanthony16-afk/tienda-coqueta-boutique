/**
 * CONTRATO de impresión. La implementación (ESC/POS por Web Bluetooth / Web
 * Serial y respaldo con window.print) vive en este directorio.
 * Los módulos POS, Caja y Ventas solo importan estas funciones.
 */
import type { RegisterSummary } from "@/domain/cash";
import type { CashRegister, SaleWithItems } from "@/domain/types";
import { layoutReceipt, layoutRegisterReport } from "./layout";
import { printDocs } from "./service";
import { getPrinterSettings } from "./settings";

export interface ReceiptOptions {
  /** Nombre del cajero para el pie del ticket. */
  cashierName?: string;
  /** "Copia" o "Reimpresión" en el encabezado. */
  copyLabel?: string;
}

export interface RegisterReportInput {
  kind: "X" | "Z";
  register: CashRegister;
  summary: RegisterSummary;
  cashierName?: string;
}

/** Imprime el ticket de venta. Resuelve cuando se envió a la impresora. */
export async function printReceipt(sale: SaleWithItems, opts: ReceiptOptions = {}): Promise<void> {
  const s = getPrinterSettings();
  const base = { paperWidth: s.paperWidth, charset: s.charset, cashierName: opts.cashierName, saleCode: s.saleCode };
  const docs = [layoutReceipt(sale, { ...base, copyLabel: opts.copyLabel })];
  if (s.copies === 2) docs.push(layoutReceipt(sale, { ...base, copyLabel: opts.copyLabel ?? "Copia" }));
  // La gaveta solo se abre en la impresión original de una venta con efectivo.
  const openDrawer =
    s.openDrawer && !opts.copyLabel && sale.status === "completed" && sale.payments.some((p) => p.method === "cash");
  await printDocs(docs, { openDrawer });
}

/** Imprime el corte X (parcial) o Z (cierre). */
export async function printRegisterReport(input: RegisterReportInput): Promise<void> {
  const s = getPrinterSettings();
  await printDocs([layoutRegisterReport(input, { paperWidth: s.paperWidth, charset: s.charset })]);
}

/**
 * Para el POS: imprime el ticket solo si "Imprimir automáticamente" está
 * activo. Devuelve true si se imprimió.
 */
export async function autoPrintReceipt(sale: SaleWithItems, opts: ReceiptOptions = {}): Promise<boolean> {
  if (!getPrinterSettings().autoPrint) return false;
  await printReceipt(sale, opts);
  return true;
}

export {
  getPrinterSettings,
  updatePrinterSettings,
  usePrinterSettings,
  DEFAULT_PRINTER_SETTINGS,
  PRINTER_SETTINGS_KEY,
  type PrinterSettings,
  type PrinterTransportKind,
} from "./settings";
export {
  usePrinterStatus,
  connectPrinter,
  autoReconnectPrinter,
  disconnectPrinter,
  setPrinterTransport,
  printTestPage,
  openCashDrawer,
  isTransportSupported,
  TRANSPORT_LABEL,
  type PrinterStatus,
} from "./service";
