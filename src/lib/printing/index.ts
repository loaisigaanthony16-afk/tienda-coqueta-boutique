/**
 * CONTRATO de impresión. La implementación (ESC/POS por Web Bluetooth / Web
 * Serial y respaldo con window.print) vive en este directorio.
 * Los módulos POS, Caja y Ventas solo importan estas funciones.
 */
import type { RegisterSummary } from "@/domain/cash";
import type { CashRegister, SaleWithItems } from "@/domain/types";

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
  void sale;
  void opts;
  throw new Error("Impresión no implementada todavía");
}

/** Imprime el corte X (parcial) o Z (cierre). */
export async function printRegisterReport(input: RegisterReportInput): Promise<void> {
  void input;
  throw new Error("Impresión no implementada todavía");
}
