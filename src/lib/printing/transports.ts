/**
 * Transportes hacia la impresora térmica: Web Bluetooth (BLE) y Web Serial
 * (USB / puerto serie). Ambos reciben bytes ESC/POS ya codificados.
 */
import { chunkBytes } from "./escpos";
import { getPrinterSettings, updatePrinterSettings } from "./settings";
import {
  getBluetooth,
  getSerial,
  type BtCharacteristic,
  type BtDevice,
  type SerialPort,
} from "./web-apis";

export interface HardwareTransport {
  readonly kind: "bluetooth" | "serial";
  isConnected(): boolean;
  deviceName(): string | null;
  /**
   * Conecta. Con `interactive` muestra el selector del navegador (requiere un
   * gesto del usuario); sin él solo reutiliza dispositivos ya autorizados.
   */
  connect(opts: { interactive: boolean }): Promise<string>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
  /** Se llama cuando el dispositivo se desconecta por su cuenta. */
  onDisconnect?: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Web Bluetooth

/** Servicios GATT habituales de impresoras térmicas BLE genéricas. */
export const PRINTER_SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
];

export const BLE_CHUNK_SIZE = 180;
const BLE_SAFE_CHUNK = 20;

export class BluetoothTransport implements HardwareTransport {
  readonly kind = "bluetooth" as const;
  onDisconnect?: () => void;
  private device: BtDevice | null = null;
  private characteristic: BtCharacteristic | null = null;
  private chunkSize = BLE_CHUNK_SIZE;

  private readonly handleDisconnect = () => {
    this.characteristic = null;
    this.onDisconnect?.();
  };

  isConnected() {
    return Boolean(this.characteristic && this.device?.gatt?.connected);
  }

  deviceName() {
    return this.device?.name ?? null;
  }

  async connect({ interactive }: { interactive: boolean }): Promise<string> {
    const bt = getBluetooth();
    if (!bt) throw new Error("Este navegador no admite Web Bluetooth. Usa Chrome o Edge en Android, Windows o macOS.");

    let device: BtDevice | null = interactive ? null : this.device;
    if (!device && !interactive) {
      const saved = getPrinterSettings().deviceId;
      if (saved && bt.getDevices) {
        const devices = await bt.getDevices().catch(() => [] as BtDevice[]);
        device = devices.find((d) => d.id === saved) ?? null;
      }
      if (!device) throw new Error("No hay una impresora Bluetooth vinculada. Pulsa «Conectar» en Ajustes.");
    }
    if (!device) {
      device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICE_UUIDS });
    }

    if (this.device && this.device !== device) {
      this.device.removeEventListener("gattserverdisconnected", this.handleDisconnect);
      this.device.gatt?.disconnect();
    }
    this.device = device;
    device.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    device.addEventListener("gattserverdisconnected", this.handleDisconnect);

    const gatt = device.gatt;
    if (!gatt) throw new Error("El dispositivo no expone GATT.");
    const server = gatt.connected ? gatt : await gatt.connect();
    this.characteristic = await findWritableCharacteristic(server);
    this.chunkSize = BLE_CHUNK_SIZE;
    updatePrinterSettings({ deviceId: device.id, deviceName: device.name ?? "Impresora Bluetooth" });
    return device.name ?? "Impresora Bluetooth";
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.isConnected()) await this.connect({ interactive: false });
    const ch = this.characteristic!;
    const withoutResponse = ch.properties.writeWithoutResponse && typeof ch.writeValueWithoutResponse === "function";
    let offset = 0;
    while (offset < bytes.length) {
      const chunk = bytes.slice(offset, offset + this.chunkSize);
      try {
        await writeChunk(ch, chunk, withoutResponse);
        offset += chunk.length;
      } catch (e) {
        // Algunas impresoras aceptan solo el MTU mínimo: reintenta con 20 bytes.
        if (this.chunkSize > BLE_SAFE_CHUNK) {
          this.chunkSize = BLE_SAFE_CHUNK;
          continue;
        }
        throw e;
      }
      // Sin confirmación, un respiro evita desbordar el búfer de la impresora.
      if (withoutResponse) await sleep(this.chunkSize > BLE_SAFE_CHUNK ? 20 : 5);
    }
  }

  async disconnect() {
    if (this.device) {
      this.device.removeEventListener("gattserverdisconnected", this.handleDisconnect);
      this.device.gatt?.disconnect();
    }
    this.characteristic = null;
    this.device = null;
  }
}

async function writeChunk(ch: BtCharacteristic, chunk: Uint8Array, withoutResponse: boolean) {
  const data = chunk as Uint8Array<ArrayBuffer>;
  if (withoutResponse) {
    try {
      await ch.writeValueWithoutResponse!(data);
      return;
    } catch {
      // Cae a writeValue.
    }
  }
  if (ch.writeValueWithResponse && ch.properties.write) await ch.writeValueWithResponse(data);
  else await ch.writeValue(data);
}

async function findWritableCharacteristic(server: {
  getPrimaryService(uuid: string): Promise<{ getCharacteristics(): Promise<BtCharacteristic[]> }>;
  getPrimaryServices(): Promise<{ getCharacteristics(): Promise<BtCharacteristic[]> }[]>;
}): Promise<BtCharacteristic> {
  const services: { getCharacteristics(): Promise<BtCharacteristic[]> }[] = [];
  for (const uuid of PRINTER_SERVICE_UUIDS) {
    try {
      services.push(await server.getPrimaryService(uuid));
    } catch {
      // No existe en este equipo.
    }
  }
  if (services.length === 0) {
    try {
      services.push(...(await server.getPrimaryServices()));
    } catch {
      // Sin permisos para otros servicios.
    }
  }
  let fallback: BtCharacteristic | null = null;
  for (const s of services) {
    let chars: BtCharacteristic[] = [];
    try {
      chars = await s.getCharacteristics();
    } catch {
      continue;
    }
    for (const c of chars) {
      if (c.properties.writeWithoutResponse) return c;
      if (c.properties.write && !fallback) fallback = c;
    }
  }
  if (fallback) return fallback;
  throw new Error("No se encontró un canal de escritura. ¿Es una impresora térmica compatible con ESC/POS?");
}

// ---------------------------------------------------------------------------
// Web Serial (USB)

export class SerialTransport implements HardwareTransport {
  readonly kind = "serial" as const;
  onDisconnect?: () => void;
  private port: SerialPort | null = null;
  private openBaud: number | null = null;
  private listening = false;

  isConnected() {
    return Boolean(this.port && this.openBaud !== null && this.port.writable);
  }

  deviceName() {
    if (!this.port) return null;
    const info = this.port.getInfo();
    return describePort(info.usbVendorId, info.usbProductId);
  }

  private listen() {
    const serial = getSerial();
    if (!serial || this.listening) return;
    this.listening = true;
    serial.addEventListener("disconnect", (e) => {
      if ((e.target as SerialPort | null) === this.port || (e as Event & { port?: SerialPort }).port === this.port) {
        this.port = null;
        this.openBaud = null;
        this.onDisconnect?.();
      }
    });
  }

  async connect({ interactive }: { interactive: boolean }): Promise<string> {
    const serial = getSerial();
    if (!serial) throw new Error("Este navegador no admite Web Serial. Usa Chrome o Edge en computadora.");
    this.listen();
    const settings = getPrinterSettings();

    let port: SerialPort | null = interactive ? null : this.port;
    if (!port && !interactive) {
      const ports = await serial.getPorts();
      port =
        ports.find((p) => {
          const i = p.getInfo();
          return i.usbVendorId === settings.usbVendorId && i.usbProductId === settings.usbProductId;
        }) ?? (ports.length === 1 ? ports[0] : null);
      if (!port) throw new Error("No hay una impresora USB autorizada. Pulsa «Conectar» en Ajustes.");
    }
    if (!port) port = await serial.requestPort();

    if (this.port && this.port !== port && this.openBaud !== null) {
      await this.port.close().catch(() => undefined);
      this.openBaud = null;
    }
    if (this.port === port && this.openBaud !== null && this.openBaud !== settings.baudRate) {
      await port.close().catch(() => undefined);
      this.openBaud = null;
    }
    this.port = port;
    if (this.openBaud === null) {
      try {
        await port.open({ baudRate: settings.baudRate, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      } catch (e) {
        // Ya abierto por esta misma página (p. ej. tras recargar módulos).
        if (!(e instanceof DOMException && e.name === "InvalidStateError")) throw e;
      }
      this.openBaud = settings.baudRate;
    }
    const info = port.getInfo();
    const name = describePort(info.usbVendorId, info.usbProductId);
    updatePrinterSettings({ usbVendorId: info.usbVendorId, usbProductId: info.usbProductId, deviceName: name });
    return name;
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.isConnected() || this.openBaud !== getPrinterSettings().baudRate) {
      await this.connect({ interactive: false });
    }
    const writable = this.port?.writable;
    if (!writable) throw new Error("El puerto no admite escritura.");
    const writer = writable.getWriter();
    try {
      for (const chunk of chunkBytes(bytes, 1024)) await writer.write(chunk);
    } finally {
      writer.releaseLock();
    }
  }

  async disconnect() {
    if (this.port && this.openBaud !== null) await this.port.close().catch(() => undefined);
    this.port = null;
    this.openBaud = null;
  }
}

function hex(n: number) {
  return n.toString(16).padStart(4, "0").toUpperCase();
}

function describePort(vendor?: number, product?: number) {
  if (vendor === undefined) return "Puerto serie";
  return `USB ${hex(vendor)}:${product !== undefined ? hex(product) : "????"}`;
}
