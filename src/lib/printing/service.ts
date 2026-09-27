/**
 * Servicio de impresión: elige el transporte según las preferencias, mantiene
 * la conexión y cae a window.print() si el hardware falla.
 */
"use client";
import { create } from "zustand";
import { printDocsInBrowser } from "./browser-print";
import { drawerKickBytes, encodeDocs } from "./escpos";
import { layoutTestPage, type PrintDoc } from "./layout";
import { getPrinterSettings, updatePrinterSettings, type PrinterTransportKind } from "./settings";
import { BluetoothTransport, SerialTransport, type HardwareTransport } from "./transports";
import { isBluetoothSupported, isSerialSupported } from "./web-apis";

export type PrinterStatus = "idle" | "connecting" | "connected" | "printing" | "error";

interface PrinterStatusState {
  status: PrinterStatus;
  deviceName: string | null;
  error: string | null;
  /** Último trabajo que tuvo que imprimirse con el navegador por un fallo. */
  lastFallbackAt: string | null;
}

export const usePrinterStatus = create<PrinterStatusState>(() => ({
  status: "idle",
  deviceName: null,
  error: null,
  lastFallbackAt: null,
}));

export const TRANSPORT_LABEL: Record<PrinterTransportKind, string> = {
  browser: "Navegador (window.print)",
  bluetooth: "Bluetooth",
  serial: "USB / Serie",
};

let bluetooth: BluetoothTransport | null = null;
let serial: SerialTransport | null = null;

function onDeviceLost() {
  const s = usePrinterStatus.getState();
  if (s.status === "connected" || s.status === "printing") {
    usePrinterStatus.setState({ status: "idle", error: "La impresora se desconectó." });
  }
}

function hardware(kind: "bluetooth" | "serial"): HardwareTransport {
  if (kind === "bluetooth") {
    bluetooth ??= new BluetoothTransport();
    bluetooth.onDisconnect = onDeviceLost;
    return bluetooth;
  }
  serial ??= new SerialTransport();
  serial.onDisconnect = onDeviceLost;
  return serial;
}

export function isTransportSupported(kind: PrinterTransportKind): boolean {
  if (kind === "bluetooth") return isBluetoothSupported();
  if (kind === "serial") return isSerialSupported();
  return typeof window !== "undefined" && typeof window.print === "function";
}

export function errorMessage(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotFoundError") return "No se eligió ninguna impresora.";
    if (e.name === "SecurityError") return "El navegador bloqueó el acceso. Pulsa «Conectar» de nuevo.";
    if (e.name === "NetworkError") return "No se pudo conectar con la impresora. ¿Está encendida y cerca?";
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Conecta con la impresora configurada. `interactive` debe venir de un clic
 * (muestra el selector); sin él solo reconecta a un dispositivo ya autorizado.
 */
export async function connectPrinter(opts: { interactive?: boolean } = {}): Promise<string | null> {
  const { transport } = getPrinterSettings();
  if (transport === "browser") {
    usePrinterStatus.setState({ status: "connected", deviceName: "Diálogo de impresión", error: null });
    return "Diálogo de impresión";
  }
  usePrinterStatus.setState({ status: "connecting", error: null });
  try {
    const name = await hardware(transport).connect({ interactive: Boolean(opts.interactive) });
    usePrinterStatus.setState({ status: "connected", deviceName: name, error: null });
    return name;
  } catch (e) {
    const msg = errorMessage(e);
    usePrinterStatus.setState({ status: opts.interactive ? "error" : "idle", error: msg });
    if (opts.interactive) throw new Error(msg);
    return null;
  }
}

/** Reconexión silenciosa al cargar (sin gesto del usuario). */
export async function autoReconnectPrinter(): Promise<void> {
  const s = getPrinterSettings();
  if (s.transport === "browser" || !isTransportSupported(s.transport)) return;
  if (hardware(s.transport).isConnected()) {
    usePrinterStatus.setState({ status: "connected", deviceName: hardware(s.transport).deviceName() });
    return;
  }
  await connectPrinter({ interactive: false });
}

export async function disconnectPrinter(forget = false): Promise<void> {
  await Promise.all([bluetooth?.disconnect(), serial?.disconnect()]);
  if (forget) {
    updatePrinterSettings({ deviceId: undefined, deviceName: undefined, usbVendorId: undefined, usbProductId: undefined });
  }
  usePrinterStatus.setState({ status: "idle", deviceName: null, error: null });
}

/** Al cambiar de transporte se cierra la conexión anterior. */
export async function setPrinterTransport(kind: PrinterTransportKind): Promise<void> {
  await Promise.all([bluetooth?.disconnect(), serial?.disconnect()]);
  updatePrinterSettings({ transport: kind });
  usePrinterStatus.setState({ status: "idle", deviceName: null, error: null });
}

async function sendHardware(kind: "bluetooth" | "serial", bytes: Uint8Array) {
  const t = hardware(kind);
  usePrinterStatus.setState({ status: "printing", error: null });
  try {
    await t.write(bytes);
    usePrinterStatus.setState({ status: "connected", deviceName: t.deviceName() });
  } catch (e) {
    usePrinterStatus.setState({ status: "error", error: errorMessage(e) });
    throw e;
  }
}

/**
 * Imprime documentos con el transporte configurado. Si el hardware falla,
 * cae a la impresión del navegador (console.warn) y solo lanza si ese
 * respaldo también falla.
 */
export async function printDocs(docs: PrintDoc[], opts: { openDrawer?: boolean } = {}): Promise<void> {
  const settings = getPrinterSettings();
  if (settings.transport !== "browser") {
    try {
      if (!isTransportSupported(settings.transport)) {
        throw new Error(`${TRANSPORT_LABEL[settings.transport]} no está disponible en este navegador.`);
      }
      const bytes = encodeDocs(docs, { charset: settings.charset, openDrawer: opts.openDrawer });
      await sendHardware(settings.transport, bytes);
      return;
    } catch (e) {
      console.warn("[impresión] Falló la impresora; se usa el navegador.", e);
      usePrinterStatus.setState({ lastFallbackAt: new Date().toISOString(), error: errorMessage(e) });
    }
  }
  await printDocsInBrowser(docs);
}

/** Página de prueba (usa el transporte configurado; con hardware no cae al navegador). */
export async function printTestPage(): Promise<void> {
  const s = getPrinterSettings();
  const doc = layoutTestPage({ paperWidth: s.paperWidth, charset: s.charset, transportLabel: TRANSPORT_LABEL[s.transport] });
  if (s.transport === "browser") return printDocsInBrowser([doc]);
  await sendHardware(s.transport, encodeDocs([doc], { charset: s.charset }));
}

/** Abre la gaveta (solo con impresora ESC/POS conectada). */
export async function openCashDrawer(): Promise<void> {
  const s = getPrinterSettings();
  if (s.transport === "browser") throw new Error("Para abrir la gaveta se necesita una impresora Bluetooth o USB.");
  await sendHardware(s.transport, drawerKickBytes());
}
