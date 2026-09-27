/**
 * Tipos mínimos de Web Bluetooth y Web Serial (sin paquetes @types).
 * Solo lo que usa este módulo.
 */

export interface BtCharacteristicProperties {
  write: boolean;
  writeWithoutResponse: boolean;
}

export interface BtCharacteristic {
  uuid: string;
  properties: BtCharacteristicProperties;
  writeValue(data: BufferSource): Promise<void>;
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
  writeValueWithResponse?(data: BufferSource): Promise<void>;
}

export interface BtService {
  uuid: string;
  getCharacteristics(): Promise<BtCharacteristic[]>;
}

export interface BtGattServer {
  connected: boolean;
  connect(): Promise<BtGattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BtService>;
  getPrimaryServices(): Promise<BtService[]>;
}

export interface BtDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BtGattServer;
}

export interface BtRequestOptions {
  filters?: { services?: string[]; namePrefix?: string; name?: string }[];
  acceptAllDevices?: boolean;
  optionalServices?: string[];
}

export interface Bluetooth {
  getAvailability?(): Promise<boolean>;
  requestDevice(options: BtRequestOptions): Promise<BtDevice>;
  /** Solo en Chrome con la función habilitada. */
  getDevices?(): Promise<BtDevice[]>;
}

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPort extends EventTarget {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: "none" | "even" | "odd"; flowControl?: "none" | "hardware" }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

export interface Serial extends EventTarget {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

type NavigatorWithHardware = Navigator & { bluetooth?: Bluetooth; serial?: Serial };

function nav(): NavigatorWithHardware | null {
  return typeof navigator === "undefined" ? null : (navigator as NavigatorWithHardware);
}

export function getBluetooth(): Bluetooth | null {
  return nav()?.bluetooth ?? null;
}

export function getSerial(): Serial | null {
  return nav()?.serial ?? null;
}

export function isBluetoothSupported(): boolean {
  return getBluetooth() !== null && typeof window !== "undefined" && window.isSecureContext;
}

export function isSerialSupported(): boolean {
  return getSerial() !== null && typeof window !== "undefined" && window.isSecureContext;
}
