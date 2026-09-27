/**
 * Preferencias de impresión, guardadas por equipo en localStorage
 * ("coqueta.printer"). Se leen tanto desde React (usePrinterSettings) como
 * desde el servicio de impresión (getPrinterSettings).
 */
import * as React from "react";
import type { Charset } from "./codepage";
import type { PaperWidth, SaleCode } from "./layout";

export const PRINTER_SETTINGS_KEY = "coqueta.printer";

export type PrinterTransportKind = "browser" | "bluetooth" | "serial";

export interface PrinterSettings {
  transport: PrinterTransportKind;
  paperWidth: PaperWidth;
  /** Imprimir el ticket automáticamente al terminar cada venta. */
  autoPrint: boolean;
  /** Abrir la gaveta al imprimir un ticket con pago en efectivo. */
  openDrawer: boolean;
  copies: 1 | 2;
  /** Velocidad para Web Serial. */
  baudRate: number;
  /** Página de códigos de la impresora. */
  charset: Charset;
  /** Código del número de venta al pie del ticket. */
  saleCode: SaleCode;
  /** Último dispositivo usado (para reconectar sin preguntar). */
  deviceId?: string;
  deviceName?: string;
  /** Web Serial: identificación USB del último puerto. */
  usbVendorId?: number;
  usbProductId?: number;
}

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const;

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  transport: "browser",
  paperWidth: 80,
  autoPrint: false,
  openDrawer: false,
  copies: 1,
  baudRate: 9600,
  charset: "pc850",
  saleCode: "none",
};

export function normalizeSettings(raw: unknown): PrinterSettings {
  const d = DEFAULT_PRINTER_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  const out: PrinterSettings = {
    transport: pick(r.transport, ["browser", "bluetooth", "serial"] as const, d.transport),
    paperWidth: pick(r.paperWidth, [58, 80] as const, d.paperWidth),
    autoPrint: typeof r.autoPrint === "boolean" ? r.autoPrint : d.autoPrint,
    openDrawer: typeof r.openDrawer === "boolean" ? r.openDrawer : d.openDrawer,
    copies: pick(r.copies, [1, 2] as const, d.copies),
    baudRate: typeof r.baudRate === "number" && r.baudRate > 0 ? r.baudRate : d.baudRate,
    charset: pick(r.charset, ["pc850", "pc858", "ascii"] as const, d.charset),
    saleCode: pick(r.saleCode, ["none", "qr", "barcode"] as const, d.saleCode),
  };
  if (typeof r.deviceId === "string") out.deviceId = r.deviceId;
  if (typeof r.deviceName === "string") out.deviceName = r.deviceName;
  if (typeof r.usbVendorId === "number") out.usbVendorId = r.usbVendorId;
  if (typeof r.usbProductId === "number") out.usbProductId = r.usbProductId;
  return out;
}

// ---------------------------------------------------------------------------
// Almacén externo mínimo (compatible con useSyncExternalStore)

let cache: PrinterSettings | null = null;
let cacheRaw: string | null | undefined;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(PRINTER_SETTINGS_KEY);
  } catch {
    return null;
  }
}

/** Lee las preferencias actuales (siempre frescas desde localStorage). */
export function getPrinterSettings(): PrinterSettings {
  const raw = readRaw();
  if (cache && raw === cacheRaw) return cache;
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  cache = normalizeSettings(parsed);
  cacheRaw = raw;
  return cache;
}

export function updatePrinterSettings(patch: Partial<PrinterSettings>): PrinterSettings {
  const next = normalizeSettings({ ...getPrinterSettings(), ...patch });
  // Permite borrar campos opcionales pasando undefined.
  for (const k of Object.keys(patch) as (keyof PrinterSettings)[]) {
    if (patch[k] === undefined) delete next[k];
  }
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(PRINTER_SETTINGS_KEY, raw);
  } catch {
    // Sin almacenamiento (modo privado): se mantiene solo en memoria.
  }
  cache = next;
  cacheRaw = readRaw() ?? raw;
  listeners.forEach((l) => l());
  return next;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PRINTER_SETTINGS_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => DEFAULT_PRINTER_SETTINGS;

/** Hook: [preferencias, actualizar]. En el servidor devuelve los valores por defecto. */
export function usePrinterSettings(): [PrinterSettings, (patch: Partial<PrinterSettings>) => void] {
  const settings = React.useSyncExternalStore(subscribe, getPrinterSettings, getServerSnapshot);
  return [settings, updatePrinterSettings];
}
