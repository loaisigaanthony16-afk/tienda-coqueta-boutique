/**
 * Codificador ESC/POS puro. Convierte un PrintDoc en bytes listos para enviar
 * a la impresora por Bluetooth o serie.
 */
import { ESC_T_NUMBER, encodeText, type Charset } from "./codepage";
import type { Align, PrintDoc } from "./layout";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class EscPos {
  private chunks: number[] = [];

  private push(...bytes: number[]) {
    for (const b of bytes) this.chunks.push(b & 0xff);
    return this;
  }

  private pushBytes(bytes: Uint8Array) {
    for (const b of bytes) this.chunks.push(b);
    return this;
  }

  /** ESC @ — reinicia la impresora. */
  init() {
    return this.push(ESC, 0x40);
  }

  /** ESC t n — selecciona la página de códigos. */
  codePage(n: number) {
    return this.push(ESC, 0x74, n);
  }

  /** ESC a n — alineación. */
  align(a: Align) {
    return this.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }

  /** ESC E n — negrita. */
  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  /** GS ! n — tamaño de carácter (1–8 en ancho y alto). */
  size(width: number, height = width) {
    const w = Math.min(8, Math.max(1, width)) - 1;
    const h = Math.min(8, Math.max(1, height)) - 1;
    return this.push(GS, 0x21, (w << 4) | h);
  }

  text(text: string, charset: Charset) {
    return this.pushBytes(encodeText(text, charset));
  }

  newline() {
    return this.push(LF);
  }

  /** ESC d n — avanza n líneas. */
  feed(lines = 1) {
    return this.push(ESC, 0x64, Math.min(255, Math.max(0, lines)));
  }

  /** GS V 66 n — avanza n puntos y hace corte parcial. */
  cut(feedDots = 3) {
    return this.push(GS, 0x56, 0x42, feedDots);
  }

  /** ESC p m t1 t2 — pulso a la gaveta (pin 2, 50 ms / 500 ms). */
  openDrawer() {
    return this.push(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  /** QR modelo 2 con GS ( k. */
  qr(data: string, moduleSize = 6) {
    const payload = encodeText(data, "ascii");
    const storeLen = payload.length + 3;
    this.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // modelo 2
    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.min(16, Math.max(1, moduleSize))); // tamaño
    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // corrección M
    this.push(GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30);
    this.pushBytes(payload);
    return this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // imprimir
  }

  /** CODE128 (juego B) con texto legible debajo. */
  barcode128(data: string, height = 60) {
    const payload = encodeText(data, "ascii").slice(0, 253);
    this.push(GS, 0x68, Math.min(255, Math.max(1, height))); // alto
    this.push(GS, 0x77, 2); // ancho de módulo
    this.push(GS, 0x48, 2); // HRI debajo
    this.push(GS, 0x6b, 73, payload.length + 2, 0x7b, 0x42); // {B
    return this.pushBytes(payload);
  }

  raw(bytes: Uint8Array | number[]) {
    for (const b of bytes) this.chunks.push(b & 0xff);
    return this;
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

export interface EncodeOptions {
  charset: Charset;
  /** Abrir la gaveta al inicio del trabajo. */
  openDrawer?: boolean;
  /** Cortar el papel al final (por defecto sí). */
  cut?: boolean;
  /** Reiniciar la impresora al inicio (por defecto sí). */
  init?: boolean;
}

/** Codifica uno o varios documentos (copias) en un solo trabajo. */
export function encodeDocs(docs: PrintDoc[], opts: EncodeOptions): Uint8Array {
  const p = new EscPos();
  if (opts.init !== false) p.init();
  p.codePage(ESC_T_NUMBER[opts.charset]);
  if (opts.openDrawer) p.openDrawer();

  for (const doc of docs) {
    let bold = false;
    let size = 1;
    let align: Align = "left";
    p.align("left").bold(false).size(1);
    for (const line of doc.lines) {
      switch (line.type) {
        case "feed":
          p.feed(line.lines);
          break;
        case "qr":
          if (align !== "center") p.align((align = "center"));
          p.qr(line.data).newline();
          break;
        case "barcode":
          if (align !== "center") p.align((align = "center"));
          p.barcode128(line.data).newline();
          break;
        case "text": {
          const a = line.align ?? "left";
          const b = Boolean(line.bold);
          const s = line.size ?? 1;
          if (a !== align) p.align((align = a));
          if (b !== bold) p.bold((bold = b));
          if (s !== size) p.size((size = s));
          p.text(line.text, opts.charset).newline();
          break;
        }
      }
    }
    p.align("left").bold(false).size(1);
    if (opts.cut !== false) p.feed(4).cut();
    else p.feed(2);
  }
  return p.bytes();
}

export function encodeDoc(doc: PrintDoc, opts: EncodeOptions): Uint8Array {
  return encodeDocs([doc], opts);
}

/** Solo el pulso de gaveta (botón "Abrir gaveta"). */
export function drawerKickBytes(): Uint8Array {
  return new EscPos().init().openDrawer().bytes();
}

/** Parte el buffer en trozos de a lo sumo `size` bytes. */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  if (size <= 0) throw new Error("Tamaño de bloque inválido");
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}
